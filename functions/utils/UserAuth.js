const jsonwebtoken = require("jsonwebtoken");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const bs58check = require("bs58check");
const KeyEncoder = require("key-encoder").default;
const { db, firestoreRef } = require("./admin");

const fetch = require("node-fetch");
/**
 * Validates JWT token using BitClout Identity
 *
 * Thanks to: https://github.com/mattetre/bitclout-jwt-validate
 */
function validateJwt(bitCloutPublicKey, jwtToken) {
  const bitCloutPublicKeyDecoded = bs58check.decode(bitCloutPublicKey);

  // manipulate the decoded key to remove the prefix that gets added
  // see: privateKeyToBitcloutPublicKey - https://github.com/bitclout/identity/blob/main/src/app/crypto.service.ts#L128

  // turn buffer into an array to easily manipulate
  const bitCloutPublicKeyDecodedArray = [...bitCloutPublicKeyDecoded];
  // Remove the public key prefix to get the 'raw public key'
  // not sure if hardcoding this to 3 elements is safe
  // see: PUBLIC_KEY_PREFIXES - https://github.com/bitclout/identity/blob/main/src/app/crypto.service.ts#L22
  const rawPublicKeyArray = bitCloutPublicKeyDecodedArray.slice(3);

  const rawPublicKeyHex = ec
    .keyFromPublic(rawPublicKeyArray, "hex")
    .getPublic()
    .encode("hex", true);

  const keyEncoder = new KeyEncoder("secp256k1");
  const rawPublicKeyEncoded = keyEncoder.encodePublic(
    rawPublicKeyHex,
    "raw",
    "pem"
  );

  let result;

  // if the jwt or public key is invalid this will throw an error
  try {
    jsonwebtoken.verify(jwtToken, rawPublicKeyEncoded, {
      algorithms: ["ES256"],
    });
    result = true;
  } catch {
    result = false;
  }

  return result;
}

/**
 * 1) Verifies the user through validating the jwt according to the public key
 * 2) Gets username from BitClout API
 * 3) Sets req.user = {
 *  id: "publickey"
 *  username: "username"
 * }
 * 4) Creates account in database if it hasn''t been created yet
 */
module.exports = async (req, res, next) => {
  //get jwt and public token params from body
  let jwt = req.body.jwt;
  let publickey = req.body.publickey;

  if (!jwt || !publickey) {
    return res.status(400).json({
      general: "Error. Could not obtain jwt and publickey headers from request",
    });
  }

  //validate Jwt
  const validJwtToken = validateJwt(publickey, jwt);
  if (!validJwtToken) {
    return res.status(400).json({
      general:
        "Error. Invalid identification. Could not validate jwt with public key.",
    });
  }

  //get user's username from BitClout API
  const url = `https://bitclout.com/api/v0/get-single-profile`;
  let resData = {};
  await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ PublicKeyBase58Check: publickey }),
  })
    .then((response) => response.json())
    .then((data) => {
      resData = data;
      //console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
      return res.status(400).json({
        general: "Error. Could not get username for public key",
      });
    });

  //set req.user to their BitClout Public Key
  req.user = {};
  req.user.id = publickey;
  req.user.username = resData.Profile.Username;

  //if account hasn't been created already in database, create it
  await db
    .doc(`/users/${req.user.id}`)
    .get()
    .then(async (doc) => {
      if (!doc.exists) {
        const blankTemplate = {
          badgesIssued: [],
          badgesReceived: [],
          badgesListed: [],
          badgesAccepted: [],
          badgesPending: [],
          issuedCollections: [],
          receivedCollections: []
        };
        await db.doc(`/users/${req.user.id}`).set(blankTemplate);
      }

      next();
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Could not create ${req.user.id}'s data in our database.`,
      });
    });
};
