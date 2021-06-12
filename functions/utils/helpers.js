const { db, firestoreRef } = require("./admin");

const isStr = (val) => typeof val === "string";

const isEmpty = (string) => {
  return string.trim() === "";
};
exports.isColor = (strColor) => {
  const s = new Option().style;
  s.color = strColor;
  return s.color !== "";
};

exports.isURL = (str) => {
  var pattern = new RegExp(
    "^(https?:\\/\\/)?" + // protocol
      "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // domain name
      "((\\d{1,3}\\.){3}\\d{1,3}))" + // OR ip (v4) address
      "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // port and path
      "(\\?[;&a-z\\d%_.~+=-]*)?" + // query string
      "(\\#[-a-z\\d_]*)?$",
    "i"
  ); // fragment locator
  return !!pattern.test(str);
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

exports.isValidStringArray = async (array) => {
  let valid = true;
  array.forEach((str) => {
    if (!this.isString(str)) {
      valid = false;
    }
  });
  return valid;
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

exports.uvarint64ToBuf = (uint) => {
  const result = [];

  while (uint >= 0x80) {
    result.push((uint & 0xff) | 0x80);
    uint >>>= 7;
  }

  result.push(uint | 0);

  return new Buffer(result);
};
