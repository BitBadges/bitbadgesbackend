const { db, firestoreRef } = require("../utils/admin");
const { create } = require("ipfs-http-client");
const client = create("https://ipfs.infura.io:5001");
const fetch = require("node-fetch");

const {
  isValidString,
  isString,
  isValidInteger,
  isBoolean,
} = require("../utils/helpers");

//Getter method for a badge
exports.getBadge = (req, res) => {
  let badgeId = req.params.id;

  db.doc(`/badges/${badgeId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        throw "Doc doesn't exist";
      }
      return res.status(201).json(doc.data());
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Error. Could not get badge: ${badgeId}`,
        error: err,
      });
    });
};

//Creates a badge after validating all input is valid
exports.createBadge = async (req, res) => {
  let userId = req.user.id;
  let badgeData = {
    title: req.body.title,
    issuer: req.body.issuer,
    recipient: req.body.recipient,
    description: req.body.description,
    imageUrl: req.body.imageUrl,
    validDates: req.body.validDates,
    validDateStart: req.body.validDateStart,
    validDateEnd: req.body.validDateEnd,
    backgroundColor: req.body.backgroundColor,
    externalUrl: req.body.externalUrl,
    dateCreated: Date.now(),
  };

  let valid =
    isValidString(badgeData.title) &&
    isValidString(badgeData.issuer) &&
    isValidString(badgeData.recipient) &&
    isValidString(badgeData.backgroundColor) &&
    isString(badgeData.description) &&
    isString(badgeData.externalUrl) &&
    isString(badgeData.imageUrl);

  if (!valid) {
    return res.status(400).json({
      general: `String inputs are not formatted correctly`,
    });
  }

  valid = req.user.username === badgeData.issuer;
  if (!valid) {
    return res.status(400).json({
      general: `You can not issue in someone else's name. Change issuer to your id`,
    });
  }

  valid = isBoolean(badgeData.validDates);
  if (!valid) {
    return res.status(400).json({
      general: `validDates must be a boolean.`,
    });
  }
  if (badgeData.validDates) {
    valid =
      isValidInteger(badgeData.validDateStart) &&
      isValidInteger(badgeData.validDateEnd);
    if (!valid) {
      return res.status(400).json({
        general: `validDateStart and validDateEnd must be an integer representing the number of milliseconds since 1/1/1970 00:00:00 UTC`,
      });
    }
  } else {
    badgeData.validDateEnd = 8640000000000000;
    badgeData.validDateStart = Date.now();
  }

  const { cid } = await client.add(JSON.stringify(badgeData));
  let ipfsHash = cid.toString();

  badgeData.id = ipfsHash;

  //get recipient publicKe
  let recipientPublicKey = null;
  let url = `https://bitclout.com/api/v0/get-single-profile`;
  let resData = {};
  console.log({ PublicKeyBase58Check: userId });
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Username: badgeData.recipient }),
  })
    .then((response) => response.json())
    .then((data) => {
      resData = data;
      recipientPublicKey = data.Profile.PublicKeyBase58Check;
    })
    .catch((error) => {
      return res.status(400).json({
        general: "Could not get public key for recipient's username",
        error: error,
      });
    });

  await db
    .doc(`/users/${recipientPublicKey}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        valid = false;
      }
    });
  if (!valid) {
    await db.doc(`/users/${recipientPublicKey}`).set({
      badgesIssued: [],
      badgesReceived: [],
      badgesCreated: [],
    });
  }
  console.log(badgeData.issuer);
  Promise.all([
    db.collection(`/badges`).doc(ipfsHash).set(badgeData),
    db.doc(`/users/${recipientPublicKey}`).update({
      badgesReceived: firestoreRef.FieldValue.arrayUnion(ipfsHash),
    }),
    db.doc(`/users/${userId}`).update({
      badgesIssued: firestoreRef.FieldValue.arrayUnion(ipfsHash),
    }),
  ]);

  url = `https://bitclout.com/api/v0/submit-post`;
  let transactionHex = null;
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      UpdaterPublicKeyBase58Check:
        "BC1YLjPA6yn4mk9NnbFUiNbjitu4442dSwLKrTFLBqTwjph11HRjjZZ",
      PostHashHexToModify: "",
      ParentStakeID: "",
      Title: "",
      BodyObj: {
        Body: ipfsHash,
        ImageURLs: [],
      },
      RecloutedPostHashHex: "",
      PostExtraData: {},
      Sub: "",
      IsHidden: false,
      MinFeeRateNanosPerKB: 1000,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      transactionHex = data.TransactionHex;
    })
    .catch((error) => {
      //should never reach here
      return res.status(400).json({
        general:
          "IMPORTANT: Could not submit post to BitClout chain! Please contact @BitBadges with your badge id to get it posted",
        error: error,
      });
    });

  url = `https://us-central1-bitbadgespostbot.cloudfunctions.net/api/sign`;
  let signedHex = null;
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transactionHex,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      signedHex = data.signedHex;
    })
    .catch((error) => {
      //should never reach here
      return res.status(400).json({
        general:
          "IMPORTANT: Could not submit post to BitClout chain because we couldn't sign your transaction hex! Please contact @BitBadges with your badge id to get it posted",
        error: error,
      });
    });

  url = `https://bitclout.com/api/v0/submit-transaction`;
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      TransactionHex: signedHex,
    }),
  }).catch((error) => {
    //should never reach here
    return res.status(400).json({
      general:
        "IMPORTANT: Could not submit post to BitClout chain because we couldn't submit your transaction! Please contact @BitBadges with your badge id to get it posted",
      error: error,
    });
  });

  return res.status(201).send(badgeData);
};
