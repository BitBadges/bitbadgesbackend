/*
app.post('/createCollection', UserAuth, createCollection);
app.delete('/deleteCollection', UserAuth, deleteCollection);
app.post('/addToCollection', UserAuth, addToCollection);
app.delete('removeFromCollection', UserAuth, removeFromCollection);
*/

const { firestore } = require('firebase-admin');
const { db } = require('../utils/admin');
const {
  isURL,
  isColor,
  isString,
  isBoolean,
  isValidString,
  allBadgesInIssued,
  allBadgesInReceived,
  isValidStringArray,
} = require('../utils/helpers');

exports.createCollection = async (req, res) => {
  const userId = req.user.id;
  const name = req.body.name;
  const receivedCollection = req.body.receivedCollection;
  const description = req.body.description;
  const imageUrl = req.body.imageUrl;
  const backgroundColor = req.body.backgroundColor;
  const badges = req.body.badges;
  const isVisible = true;

  let collection = {
    name,
    receivedCollection,
    description,
    imageUrl,
    backgroundColor,
    badges,
    isVisible,
  };

  //validate all input fields
  let valid = isValidString(collection.name);
  if (!valid) {
    return res.status(400).json({
      general: `Please enter a valid string for the collection name`,
    });
  }

  if (!collection.description) {
    collection.description = '';
  }
  valid = isString(collection.description);
  if (!valid) {
    return res.status(400).json({
      general: `Please enter a valid string for the description`,
    });
  }

  if (!collection.imagelUrl || collection.imagelUrl.length == 0) {
    collection.imageUrl =
      'https://images.bitclout.com/59638de19a21210d7ddd47ecec5ec041532930d5ec76b88b6ccebb14b2e6f571.webp';
  }
  valid = isValidString(collection.imageUrl) && isURL(collection.imageUrl);
  if (!valid) {
    return res.status(400).json({
      general: `Please enter a valid URL for the image URL`,
    });
  }

  valid = isValidString(collection.backgroundColor);
  if (!valid) {
    return res.status(400).json({
      general: `Please enter a valid string for the background color`,
    });
  }

  if (
    collection.backgroundColor &&
    collection.backgroundColor.length > 0 &&
    !isColor(collection.backgroundColor)
  ) {
    return res.status(400).json({
      general: `Not a valid HTML color name.`,
    });
  }

  if (!collection.backgroundColor || collection.backgroundColor.length == 0) {
    collection.backgroundColor = '#000000';
  }

  valid = isBoolean(collection.receivedCollection);
  if (!valid) {
    return res.status(400).json({
      general: `receivedCollection must be a boolean.`,
    });
  }

  valid = isBoolean(collection.isVisible);
  if (!valid) {
    return res.status(400).json({
      general: `isVisible must be a boolean.`,
    });
  }

  if (collection.receivedCollection) {
    valid = await allBadgesInReceived(collection.badges, userId);
    if (!valid) {
      return res.status(400).json({
        general: `One or more badges in your badge array does nis not in your received badges.`,
      });
    }
  } else {
    valid = await allBadgesInIssued(collection.badges, userId);
    if (!valid) {
      return res.status(400).json({
        general: `One or more badges in your badge array does nis not in your received badges.`,
      });
    }
  }

  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .doc(name)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(400).json({
          general: 'Error. Collection with same name already exists.',
        });
      }
    });

  let allRecipients = [];
  let allIssuers = [];
  for (const badgeId of collection.badges) {
    await db
      .doc(`/badges/${badgeId}`)
      .get()
      .then((doc) => {
        if (doc.exists) {
          allRecipients = [...allRecipients, ...doc.data().recipients];
          allIssuers = [...allIssuers, doc.data().issuer];
        }
      });
  }

  collection.issuers = [...new Set(allIssuers)];
  collection.recipients = [...new Set(allRecipients)];
  collection.dateCreated = Date.now();

  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .doc(name)
    .set(collection);

  if (collection.receivedCollection) {
    await db.doc(`/users/${userId}`).update({
      receivedCollections: firestore.FieldValue.arrayUnion(name),
    });
  } else {
    await db.doc(`/users/${userId}`).update({
      issuedCollections: firestore.FieldValue.arrayUnion(name),
    });
  }

  return res
    .status(200)
    .json(collection);
};

exports.deleteCollection = async (req, res) => {
  let userId = req.user.id;
  let name = req.body.name;

  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .doc(name)
    .delete()
    .catch((error) => {
      return res.status(400).json({
        general: `Error deleting collection: ${error}`,
      });
    });

  await db.doc(`/users/${userId}`).update({
    receivedCollections: firestore.FieldValue.arrayRemove(name),
    issuedCollections: firestore.FieldValue.arrayRemove(name),
  });

  return res
    .status(200)
    .json({ general: `Success! Collection ${name} has been deleted` });
};

/**
 * Takes in a user's username and gets all database data for that user
 */
exports.getCollection = async (req, res) => {
  let userId = req.params.userId;
  let name = req.params.name;

  let collectionData = {};
  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .doc(name)
    .get()
    .then((doc) => {
      if (doc.exists) {
        collectionData = doc.data();
      }
    });

  return res.status(200).json(collectionData);
};

/**
 * Takes in a user's username and gets all user's collection data about that
 */
 exports.getAllUserCollections = async (req, res) => {
  let userId = req.params.userId;

  console.log(userId);

  let collections = [];
  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .get()
    .then((querySnapshot) => {
      querySnapshot.forEach(elem => {
        collections.push(elem.data());
        console.log(elem);
      })
    });

  return res.status(200).json({ collections });
};


/**
 * Takes in a user's username and gets all database data for that user
 */
exports.addToCollection = async (req, res) => {
  let userId = req.user.id;
  let badges = req.body.badges;
  let name = req.body.name;

  let valid = isValidStringArray(req.body.badges);
  if (!valid) {
    return res.status(400).json({
      general: `Badge array is not a valid string array`,
    });
  }

  let collectionData = {};
  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .doc(name)
    .get()
    .then((doc) => {
      if (doc.exists) {
        collectionData = doc.data();
      } else {
        return res
          .status(400)
          .json({ error: 'Error: Collection does not exist' });
      }
    });

  if (collectionData.receivedCollection) {
    valid = await allBadgesInReceived(badges, userId);
    if (!valid) {
      return res.status(400).json({
        general: `One or more badges in your badge array does not exist in your received badges.`,
      });
    }
  } else {
    valid = await allBadgesInIssued(collection.badges, userId);
    if (!valid) {
      return res.status(400).json({
        general: `One or more badges in your badge array does not exist in your issued badges.`,
      });
    }
  }

  let allRecipients = [];
  let allIssuers = [];
  for (const badgeId of badges) {
    await db
      .doc(`/badges/${badgeId}`)
      .get()
      .then((doc) => {
        if (doc.exists) {
          allRecipients = [...allRecipients, ...doc.data().recipients];
          allIssuers = [...allIssuers, doc.data().issuer];
        }
      });
  }
  allIssuers = [...new Set(allIssuers)];
  allRecipients = [...new Set(allRecipients)];

  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .doc(name)
    .update({
      issuers: firestore.FieldValue.arrayUnion(...allIssuers),
      recipients: firestore.FieldValue.arrayUnion(...allRecipients),
      badges: firestore.FieldValue.arrayUnion(...badges),
    });

  return res.status(200).json({
    general: 'Successfuly updated collection',
  });
};

/**
 * Takes in a user's username and gets all database data for that user
 */
exports.removeFromCollection = async (req, res) => {
  let userId = req.user.id;
  let badges = req.body.badges;
  let name = req.body.name;

  let valid = isValidStringArray(req.body.badges);
  if (!valid) {
    return res.status(400).json({
      general: `Badge array is not a valid string array`,
    });
  }

  let collectionData = {};
  await db
    .doc(`/users/${userId}`)
    .collection('collections')
    .doc(name)
    .get()
    .then((doc) => {
      if (doc.exists) {
        collectionData = doc.data();
      } else {
        return res
          .status(400)
          .json({ error: 'Error: Collection does not exist' });
      }
    });

  let newBadgeArr = [];
  for (const badge of collectionData.badges) {
    if (!badges.includes(badge)) {
      newBadgeArr.push(badge);
    }
  }

  let allRecipients = [];
  let allIssuers = [];
  for (const badgeId of newBadgeArr) {
    await db
      .doc(`/badges/${badgeId}`)
      .get()
      .then((doc) => {
        if (doc.exists) {
          allRecipients = [...allRecipients, ...doc.data().recipients];
          allIssuers = [...allIssuers, doc.data().issuer];
        }
      });
  }

  allIssuers = [...new Set(allIssuers)];
  allRecipients = [...new Set(allRecipients)];

  await db.doc(`/users/${userId}`).collection('collections').doc(name).update({
    issuers: allIssuers,
    recipients: allRecipients,
    badges: newBadgeArr,
  });

  return res.status(200).json({ general: 'Successfully updated collection' });
};
