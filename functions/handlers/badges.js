const { db, firestoreRef } = require("../utils/admin");
const { create } = require("ipfs-http-client");
const client = create("https://ipfs.infura.io:5001");

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
  valid = badgeData.issuer === userId;
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

  Promise.all([
    db.collection(`/badges`).doc(ipfsHash).set(badgeData),
    db.doc(`/users/${badgeData.recipient}`).update({
      badgesReceived: firestoreRef.FieldValue.arrayUnion(ipfsHash),
    }),
    db.doc(`/users/${badgeData.issuer}`).update({
      badgesIssued: firestoreRef.FieldValue.arrayUnion(ipfsHash),
    }),
  ]);
  return res.status(201).send(badgeData);
};
