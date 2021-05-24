const { db, firestoreRef } = require("../utils/admin");
const {
  isValidString,
  isValidBadgeArray,
  isValidInteger,
} = require("../utils/helpers");

exports.getUserInfo = async (req, res) => {
  let userId = req.params.id;
  let userData = {};
  await db
    .doc(`/users/${userId}`)
    .get()
    .then(async (doc) => {
      if (!doc.exists) {
        const blankTemplate = {
          badgesIssued: [],
          badgesReceived: [],
          badgesCreated: [],
        };
        await db.doc(`/users/${userId}`).set(blankTemplate);

        blankTemplate.portfolioPages = [];
        return res.status(201).json(blankTemplate);
      }
      userData = doc.data();
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Could not find ${userId}'s data in our database. Make sure they have signed up for BitBadges.`,
      });
    });

  await db
    .doc(`/users/${userId}`)
    .collection("portfolioPages")
    .get()
    .then((data) => {
      let badges = [];
      data.forEach((doc) => {
        badges.push(doc.data());
      });
      userData.portfolioPages = badges;
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Error. Could not get ${userId}'s portfolio preference pages`,
      });
    });

  return res.status(201).json(userData);
};

exports.addPage = async (req, res) => {
  let userId = req.user.id;

  let newPage = {
    pageTitle: req.body.pageTitle,
    badges: req.body.badges,
    pageNum: req.body.pageNum,
  };

  let valid = isValidString(newPage.pageTitle);
  if (!valid) {
    return res.status(400).json({
      general: `Please enter a valid string for the page title`,
    });
  }
  
  
  valid = isValidString(newPage.pageTitle);
  if (!valid) {
    return res.status(400).json({
      general: `Please enter a valid string for the page title`,
    });
  }

  valid = await isValidBadgeArray(newPage.badges, userId);
  if (!valid) {
    return res.status(400).json({
      general: `One or more badges in your badge array does not exist.`,
    });
  }

  valid = isValidInteger(newPage.pageNum) && newPage.pageNum >= 0;
  if (!valid) {
    return res.status(400).json({
      general: `pageNum is not a valid number.`,
    });
  }

  let currSize;
  let pageData = {};

  db.doc(`/users/${userId}`)
    .collection("portfolioPages")
    .orderBy("pageNum", "desc")
    .get()
    .then((data) => {
      currSize = data.size;
      pageData = data;
      if (newPage.pageNum > currSize) {
        throw `Error. Page num is greater than current size`;
      }
      pageData = data;
    })
    .then(async () => {
      pageData.forEach((doc) => {
        let docData = doc.data();
        if (docData.pageTitle === newPage.pageTitle) {
          throw `Error. Page already exists with that pageTitle`;
        }
      });

      pageData.forEach(async (doc) => {
        let docData = doc.data();
        if (docData.pageNum >= newPage.pageNum) {
          await doc.ref.update({
            pageNum: firestoreRef.FieldValue.increment(1),
          });
        }
      });
    })
    .then(async () => {
      await db
        .doc(`/users/${userId}`)
        .collection("portfolioPages")
        .doc(newPage.pageTitle)
        .set(newPage);

      return res.status(201).json(newPage);
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Error. Could not create ${userId}'s portfolio page.`,
        error: err,
      });
    });
};

exports.deletePage = (req, res) => {
  let userId = req.user.id;
  let idx = req.body.pageNum;
  let valid = isValidInteger(idx) && idx >= 0;
  if (!valid) {
    return res.status(400).json({
      general: `pageNum is not a valid number.`,
    });
  }
  db.doc(`/users/${userId}`)
    .collection("portfolioPages")
    .orderBy("pageNum", "desc")
    .get()
    .then(async (data) => {
      currSize = data.size;
      if (idx >= currSize) {
        throw `Error. Page num is >= current size`;
      }

      data.forEach(async (doc) => {
        let docData = doc.data();
        if (docData.pageNum > idx) {
          await doc.ref.update({
            pageNum: firestoreRef.FieldValue.increment(-1),
          });
        } else if (docData.pageNum == idx) {
          await doc.ref.delete();
        }
      });

      return res.status(201).json({
        general: `Page number ${idx} has been successfully removed!`,
      });
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Error. Could not delete ${userId}'s portfolio page.`,
        error: err,
      });
    });
};
