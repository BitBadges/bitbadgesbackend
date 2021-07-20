const { firebaseConfig } = require('firebase-functions');
const { db, firestoreRef } = require('../utils/admin');
const { isValidString, isString } = require('../utils/helpers');

//Getter method for all badge pages
exports.getAllBadgePages = async (req, res) => {
  let userId = req.params.userId;
  let badgePages = [];

  await db
    .collection("badgePages")
    .where("issuer", "==", userId)
    .get()
    .then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        let x = doc.data();
        x.id = doc.id;
        badgePages.push(x);
      });
    })
    .catch((error) => {
      console.log('Error getting documents: ', error);
      return res.status(400).json({
        general: error,
      });
    });

  return res.status(200).json( { badgePages } );
};

/**
 * Getter method for a single specified badge page
 *
 * req.params.id specifies the id of badgePage
 */
exports.getBadgePage = (req, res) => {
  let badgeId = req.params.id;

  db.doc(`/badgePages/${badgeId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        throw "Doc doesn't exist";
      }
      return res.status(200).json(doc.data());
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Error. Could not get badge page: ${badgeId}`,
        error: err,
      });
    });
};

/**
 * Deletes a badge page with id of req.params.id and removes id from user's badgesListed
 */
exports.deleteBadgePage = (req, res) => {
  let badgeId = req.params.id;
  let userId = req.user.id;

  Promise.all([
    db
      .doc(`/badgePages/${badgeId}`)
      .delete()
      .catch((err) => {
        console.error(err);
        return res.status(400).json({
          general: `Error. Could not delete badge page: ${badgeId}`,
        });
      }),
    db.doc(`/users/${userId}`).update({
      badgesListed: firestoreRef.FieldValue.arrayRemove(badgeId),
    }),
  ]);

  return res.status(200).json({
    general: `Successfully deleted page ${badgeId}`,
  });
};

/**
 * 1) Validates all badge page info is formatted correctly
 * 2) Uploads badge page
 * 3) Updates user info to add id to badgesListed field
 */
exports.createBadgePage = async (req, res) => {
  let userId = req.user.id;
  let userName = req.user.username;
  let docId;
  let badgeData = {
    title: req.body.title,
    issuer: req.body.issuer,
    preReqs: req.body.preReqs,
    validity: req.body.validity,
    description: req.body.description,
    externalUrl: req.body.externalUrl,
    imageUrl: req.body.imageUrl,
    backgroundColor: req.body.backgroundColor,
    category: '',
    dateCreated: Date.now()
  };

  //validates all user info
  let valid =
    isValidString(badgeData.title) &&
    isValidString(badgeData.issuer) &&
    isString(badgeData.backgroundColor) &&
    isString(badgeData.preReqs) &&
    isString(badgeData.validity) &&
    isString(badgeData.description) &&
    isString(badgeData.externalUrl) &&
    isString(badgeData.imageUrl);
  if (!valid) {
    return res.status(400).json({
      general: `Input is not formatted correctly. All must be strings, and title and issuer must not be empty.`,
    });
  }

  valid = badgeData.issuer === userId;
  if (!valid) {
    return res.status(400).json({
      general: `You can not issue in someone else's name. Change issuer to your id`,
    });
  }

  //uploads badge to database
  await db
    .collection(`/badgePages`)
    .add(badgeData)
    .then((doc) => {
      docId = doc.id;
    });

  //update user's badgesListed
  await db.doc(`/users/${userId}`).update({
    badgesListed: firestoreRef.FieldValue.arrayUnion(docId),
  });

  await db
    .collection(`/badgePages`)
    .doc(docId)
    .update({
      id: docId
    });

  badgeData.id = docId;

  return res.status(200).send(badgeData);
};
