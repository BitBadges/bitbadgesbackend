const { db, firestoreRef } = require("./admin");

const fetch = require("node-fetch");

module.exports = async (req, res, next) => {
  const url = `https://bitclout.com/api/v0/send-bitclout`;
  let senderPublicKey = req.params.senderKey;
  let numRecipients = Number(req.params.numRecipients);

  if (!numRecipients || !senderPublicKey || isNaN(numRecipients)) {
    return res.status(400).json({ general: "Params are invalid" });
  }

  let thresholdAmt = 500000;
  let amountNanos = thresholdAmt * numRecipients;

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

      return res.status(201).json({
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
