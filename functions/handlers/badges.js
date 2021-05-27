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

/**
 * Getter method for a badge
 *
 * id of badge is specified ats req.params.id
 */
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

/**
 * 1) Validates all req.body info matches badge formatting standards
 * 2) Uploads to IPFS
 * 3) Gets hash of IPFS file
 * 4) Updates issuer and recipients badgesIssued and badgesReceived data in profiles
 * 5) Uploads badge to database
 * 6) Posts hash to @BitBadgesHash BitClout account
 */
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

  //validate all input details
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

  valid = req.user.id === badgeData.issuer;
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

  //upload to IPFS and get hash
  const { cid } = await client.add(JSON.stringify(badgeData));
  let ipfsHash = cid.toString();

  badgeData.id = ipfsHash;

  //if recipient doesn't have data in our database, add it
  await db
    .doc(`/users/${badgeData.recipient}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        valid = false;
      }
    });
  if (!valid) {
    await db.doc(`/users/${badgeData.recipient}`).set({
      badgesIssued: [],
      badgesReceived: [],
      badgesCreated: [],
    });
  }
  console.log(badgeData.issuer);

  //Update issuer and recipients user info and upload badge to database
  Promise.all([
    db.collection(`/badges`).doc(ipfsHash).set(badgeData),
    db.doc(`/users/${badgeData.recipient}`).update({
      badgesReceived: firestoreRef.FieldValue.arrayUnion(ipfsHash),
    }),
    db.doc(`/users/${userId}`).update({
      badgesIssued: firestoreRef.FieldValue.arrayUnion(ipfsHash),
    }),
  ]);

  //get transactionHex for BitBadgesHash posting bot
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

  //sign the transaction using my private API
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

  //submit transaction to BitClout chain
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
