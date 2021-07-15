const { db, firestoreRef } = require("./admin");

const fetch = require("node-fetch");

module.exports = async (req, res, next) => {
  const url = `https://bitclout.com/api/v0/send-bitclout`;
  let senderPublicKey = req.params.senderKey;
  let numRecipients = Number(req.params.numRecipients);

  if (
    !numRecipients ||
    !senderPublicKey ||
    isNaN(numRecipients) ||
    numRecipients < 0
  ) {
    return res.status(400).json({ general: "Params are invalid" });
  }

  numRecipients -= 25; //adjust for free tier
  let thresholdAmt = 5000000;
  let amountNanos = thresholdAmt * numRecipients;
  amountNanos = amountNanos < 0 ? 0 : amountNanos;

  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      SenderPublicKeyBase58Check: senderPublicKey,
      RecipientPublicKeyOrUsername: "BitBadges",
      AmountNanos: amountNanos,
      MinFeeRateNanosPerKB: 1000,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        throw `Error: ${data.error}`;
      }
      let transactionHex = data.TransactionHex;

      return res.status(200).json({
        TransactionHex: transactionHex,
        amountNanos: data.SpendAmountNanos,
      });
    })
    .catch((error) => {
      console.error("Error:", error);
      return res.status(400).json({
        general: `Error ${error}`,
      });
    });
};
