const { db, firestoreRef } = require("./admin");

const isStr = (val) => typeof val === "string";

const isEmpty = (string) => {
  return string.trim() === "";
};

const isNumber = (val) => typeof val === "number" && val === val;
const isBool = (val) => typeof val === "boolean";
exports.isValidString = (str) => {
  return isStr(str) && !isEmpty(str);
};

exports.isString = (str) => {
  return isStr(str);
};

exports.isBoolean = (bool) => {
  return isBool(bool);
};

exports.isValidBadgeArray = async (badges, userId) => {
  let userReceivedBadges = [];

  await db
    .doc(`/users/${userId}`)
    .get()
    .then((doc) => {
      userReceivedBadges = doc.data().badgesReceived;
    })
    .catch((err) => {
      console.error(err);
      return false;
    });

  let valid = true;
  badges.forEach((element) => {
    if (!userReceivedBadges.includes(element)) {
      valid = false;
    }
  });
  return valid;
};

exports.isValidInteger = (num) => {
  return isNumber(num) && Number.isInteger(num);
};
