const { db, firestoreRef } = require("./admin");

const fetch = require("node-fetch");

module.exports = async (req, res, next) => {
  let userName = req.user.username;

  const url = `https://bitclout.com/api/v0/get-hodlers-for-public-key`;
  let resData = {};

  let thresholdAmt = 0.05;

  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Username: "BitBadges", FetchAll: true }),
  })
    .then((response) => response.json())
    .then((data) => {
      let hodlerObj = data.Hodlers.find(function (element) {
        return element.HODLerPublicKeyBase58Check === req.user.id;
      });
      if (!hodlerObj) {
        return res.status(400).json({
          general: `You must hold ${thresholdAmt} BitBadges creator coin to issue a badge`,
        });
      }
      resData = data;

      let currBalance = hodlerObj.BalanceNanos / 1000000000;

      if (currBalance < thresholdAmt) {
        return res.status(400).json({
          general: `You must hold ${thresholdAmt} BitBadges creator coin to issue a badge`,
        });
      }

      // console.log("Success:", data);

      next();
    })
    .catch((error) => {
      console.error("Error:", error);
      return res.status(400).json({
        general: "Error. Could not get username for public key",
      });
    });
};
