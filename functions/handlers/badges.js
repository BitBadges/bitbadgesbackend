const { db, firestoreRef } = require('../utils/admin');
const { create } = require('ipfs-http-client');
const client = create('https://ipfs.infura.io:5001');
const fetch = require('node-fetch');

const {
  isValidString,
  isString,
  isValidInteger,
  isBoolean,
  isValidStringArray,
  uvarint64ToBuf,
  isColor,
  isURL,
} = require('../utils/helpers');

exports.getBadges = async (req, res) => {
  let badgeIds = req.body.badgeIds;
  if (!req.body.badgeIds || req.body.badgeIds.length == 0) {
    return res.status(200).json({ badges: [] });
  }

  let badges = [];
  let idMap = new Set();

  await db
    .collection('badges')
    .get()
    .then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        if (badgeIds.includes(doc.data().id) && !idMap.has(doc.id)) {
          idMap.add(doc.id);
          badges.push(doc.data());
        }
      });
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Error. Could not get badges : ${badgeIds.toString()}`,
        error: err,
      });
    });

  return res.status(200).json({ badges });
};

/**
 * Getter method for a badge
 *
 * id of badge is specified ats req.params.id
 */
exports.getBadge = async (req, res) => {
  let badgeId = req.params.id;

  await db
    .doc(`/badges/${badgeId}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(200).json(doc.data());
      }
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
  let signedTransactionHex = req.body.signedTransactionHex;
  let amountNanos = req.body.amountNanos;
  req.body.recipients = [...new Set(req.body.recipients)];

  let premiumTier = req.body.recipients.length > 25;

  if (premiumTier) {
    if (!signedTransactionHex || !amountNanos) {
      return res.status(400).json({
        general: 'Please specify signedTransactionHex and amountNanos',
      });
    }

    let ratePerRecipient = 5000000;
    let numRecipients = req.body.recipients.length - 25;
    let minPrice = numRecipients * ratePerRecipient;
    if (amountNanos < minPrice) {
      return res.status(400).json({
        general: `amountNanos is not enough. Must be at least ${minPrice} for ${numRecipients} recipients`,
      });
    }

    //check if valid hex
    let hexLen = signedTransactionHex.length;

    if (hexLen <= 2) {
      return res.status(400).json({
        general: 'Invalid signed transaction hex: Not long enough to be valid',
      });
    }
    let inputTxnLen = '0x' + signedTransactionHex.substring(0, 2);
    inputTxnLen = parseInt(inputTxnLen, 16);
    if (isNaN(inputTxnLen)) {
      return res
        .status(400)
        .json({ general: 'Invalid transaction hex: InputTxnLen not a number' });
    }

    let outputTxnLenIdx = 2 + 66 * inputTxnLen;
    let recipientPublicKeyIdx = outputTxnLenIdx + 2;
    let recipientAmountNanosIdx = recipientPublicKeyIdx + 66;

    let nanoBytes = uvarint64ToBuf(amountNanos).toString('hex');
    if (nanoBytes.length + recipientAmountNanosIdx > hexLen) {
      return res.status(400).json({
        general: 'Invalid signed transaction hex: Not long enough to be valid',
      });
    }

    let recipientPublicKey = signedTransactionHex.substring(
      recipientPublicKeyIdx,
      recipientPublicKeyIdx + 66
    );
    if (
      recipientPublicKey !=
      '02b6e2717127e11282ccdee91e176381a25f1114f2e21d994e14beda538e303698'
    ) {
      return res.status(400).json({
        general:
          'Invalid recipient: recipient of transaction must be @BitBadges account',
      });
    }

    if (
      !signedTransactionHex
        .substring(recipientAmountNanosIdx)
        .startsWith(nanoBytes)
    ) {
      return res.status(400).json({
        general: 'Invalid signed transaction hex: amountNanos does not match',
      });
    }
  }

  let badgeData = {
    title: req.body.title,
    issuer: req.body.issuer,
    issuerChain: '$CLOUT',
    recipients: req.body.recipients,
    description: req.body.description,
    imageUrl: req.body.imageUrl,
    validDates: req.body.validDates,
    validDateStart: req.body.validDateStart,
    validDateEnd: req.body.validDateEnd,
    backgroundColor: req.body.backgroundColor,
    externalUrl: req.body.externalUrl,
    dateCreated: Date.now(),
    isVisible: true,
    attributes: '{}',
  };

  //validate all input details
  let valid =
    isValidString(badgeData.title) &&
    isValidString(badgeData.issuer) &&
    isValidStringArray(badgeData.recipients) &&
    isString(badgeData.backgroundColor) &&
    isString(badgeData.description) &&
    isString(badgeData.externalUrl) &&
    isString(badgeData.imageUrl);

  if (!badgeData.recipients || badgeData.recipients.length <= 0) {
    return res.status(400).json({
      general: `There must be at least one recipient.`,
    });
  } else if (!valid) {
    return res.status(400).json({
      general: `String inputs are not formatted correctly. Title and issuer are required not to be empty and all else must be valid strings. Background color must be a valid HTML color property. URLs must be in a valid URL format`,
    });
  }

  if (
    badgeData.externalUrl &&
    badgeData.externalUrl.length > 0 &&
    !isURL(badgeData.externalUrl)
  ) {
    return res.status(400).json({
      general: `URL is invalidly formatted.`,
    });
  }

  if (!badgeData.imageUrl || badgeData.imageUrl.length == 0) {
    badgeData.imageUrl =
      'https://images.bitclout.com/59638de19a21210d7ddd47ecec5ec041532930d5ec76b88b6ccebb14b2e6f571.webp';
  }

  if (
    badgeData.backgroundColor &&
    badgeData.backgroundColor.length > 0 &&
    !isColor(badgeData.backgroundColor)
  ) {
    return res.status(400).json({
      general: `Not a valid HTML color name.`,
    });
  }

  if (!badgeData.backgroundColor || badgeData.backgroundColor.length == 0) {
    badgeData.backgroundColor = '#000000';
  }

  let recipientsChains = [];
  badgeData.recipients.forEach(() => {
    recipientsChains.push('$CLOUT');
  });
  badgeData.recipientsChains = recipientsChains;

  //check if valid URL or URI here using isURL?????
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
    //make badge valid forever
    badgeData.validDateEnd = 8640000000000000;
    badgeData.validDateStart = Date.now();
  }

  //upload to IPFS and get hash
  const { cid } = await client.add(JSON.stringify(badgeData)).catch((err) => {
    return res
      .status(400)
      .json({ general: 'Could not upload to IPFS.', error: err });
  });
  let ipfsHash = cid.toString();

  badgeData.id = ipfsHash;

  //submit payment transaction to BitClout chain
  let url = `https://bitclout.com/api/v0/submit-transaction`;

  if (premiumTier) {
    await fetch(url, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        TransactionHex: signedTransactionHex,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          throw 'Payment transaction failed';
        }
        console.log(data);
      })
      .catch((error) => {
        //should never reach here
        return res.status(400).json({
          general: 'ERROR: Payment transaction never went through!',
        });
      });
  }

  //if recipient doesn't have data in our database, add it
  await badgeData.recipients.forEach(async (recipient) => {
    let recipientIsValid = true;
    await db
      .doc(`/users/${recipient}`)
      .get()
      .then((doc) => {
        if (!doc.exists) {
          recipientIsValid = false;
        }
      });
    if (!recipientIsValid) {
      await db.doc(`/users/${recipient}`).set({
        badgesIssued: [],
        badgesReceived: [ipfsHash],
        badgesListed: [],
        badgesPending: [ipfsHash],
        badgesAccepted: [],
        issuedCollections: [],
        receivedCollections: []
      });
    } else {
      await db.doc(`/users/${recipient}`).update({
        badgesReceived: firestoreRef.FieldValue.arrayUnion(ipfsHash),
        badgesPending: firestoreRef.FieldValue.arrayUnion(ipfsHash),
      });
    }
  });

  //Update issuer and recipients user info and upload badge to database
  Promise.all([
    db.collection(`/badges`).doc(ipfsHash).set(badgeData),
    db.doc(`/users/${userId}`).update({
      badgesIssued: firestoreRef.FieldValue.arrayUnion(ipfsHash),
    }),
  ]);

  //get transactionHex for BitBadgesHash posting bot
  url = `https://bitclout.com/api/v0/submit-post`;
  let transactionHex = null;
  await fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      UpdaterPublicKeyBase58Check:
        'BC1YLgvPruTYF3R66H96g1nCq9jhewpH7k8iwjQr7WoLacby8tNZNan',
      PostHashHexToModify: '',
      ParentStakeID: '',
      Title: '',
      BodyObj: {
        Body: ipfsHash,
        ImageURLs: [],
      },
      RecloutedPostHashHex: '',
      PostExtraData: {},
      Sub: '',
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
          'IMPORTANT: Could not submit post to BitClout chain! Please contact @BitBadges with your badge id to get it posted',
        error: error,
      });
    });

  //sign the transaction using my private API
  url = `https://us-central1-bitbadgespostbot.cloudfunctions.net/api/sign`;
  let signedHex = null;
  await fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
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
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
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

  return res.status(200).json(badgeData);
};
