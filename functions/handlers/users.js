const { db, firestoreRef } = require("../utils/admin");
const axios = require("axios");
const fetch = require("node-fetch");
const {
  isValidString,
  isValidBadgeArray,
  isValidInteger,
} = require("../utils/helpers");

/**
 * Gets public key from BitClout API
 * req.params.userName must be specified and a valid username or else will return error
 *
 * Returns all profile data from BitClout API in format
 * {
 *  Profile: {
 *    Username: "",
 *    PublicKeybase58Check: ""
 *  }
 * }
 */
exports.getPublicKey = async (req, res) => {
  let userName = req.params.userName;

  //get bitclout profile info
  const url = `https://bitclout.com/api/v0/get-single-profile`;
  let resData = {};
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Username: userName }),
  })
    .then((response) => response.json())
    .then((data) => {
      resData = data;
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });

  return res.status(201).json(resData);
};

/**
 * Gets username from BitClout API
 * req.params.publicKey must be specified and a valid public key or else will return error
 *
 * Returns all profile data from BitClout API in format
 * {
 *  Profile: {
 *    Username: "",
 *    PublicKeybase58Check: ""
 *  }
 * }
 */
exports.getUsername = async (req, res) => {
  let publicKey = req.params.publicKey;
  const url = `https://bitclout.com/api/v0/get-single-profile`;
  let resData = {};
  console.log({ PublicKeyBase58Check: publicKey });
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ PublicKeyBase58Check: publicKey }),
  })
    .then((response) => response.json())
    .then((data) => {
      resData = data;
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });

  return res.status(201).json(resData);
};

/**
 * Takes in a user's username and gets all database data for that user
 */
exports.getUserInfo = async (req, res) => {
  let userName = req.params.id;
  let userId = null;

  //get public key
  const url = `https://bitclout.com/api/v0/get-single-profile`;
  let resData = {};
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Username: userName }),
  })
    .then((response) => response.json())
    .then((data) => {
      resData = data;
      userId = data.Profile.PublicKeyBase58Check;
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });

  //get user data from databse
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

  //get user's portfolio pages from database
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

/**
 * Adds a profile page to a user profile
 *
 * req.body must specify pageTitle, badges, and pageNum
 */
exports.addPage = async (req, res) => {
  let userId = req.user.id;
  let userName = req.user.username;
  let newPage = {
    pageTitle: req.body.pageTitle,
    badges: req.body.badges,
    pageNum: req.body.pageNum,
  };

  //validate all input fields
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

  //get all current profile pages
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
      //no duplicate pageTitle allowed
      pageData.forEach((doc) => {
        let docData = doc.data();
        if (docData.pageTitle === newPage.pageTitle) {
          throw `Error. Page already exists with that pageTitle`;
        }
      });

      //update pageNums for all pages
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
      //set the new page's info
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

/**
 * Deletes a page from a user's profile
 *
 * req.body.pageNum is page to be deleted;
 */
exports.deletePage = (req, res) => {
  let userId = req.user.id;
  let idx = req.body.pageNum;
  //validate pageNum is an int
  let valid = isValidInteger(idx) && idx >= 0;
  if (!valid) {
    return res.status(400).json({
      general: `pageNum is not a valid number.`,
    });
  }
  //get all pages and update pageNums accordingly
  db.doc(`/users/${userId}`)
    .collection("portfolioPages")
    .orderBy("pageNum", "desc")
    .get()
    .then(async (data) => {
      //check if valid index
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
