const jsonwebtoken = require("jsonwebtoken");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const bs58check = require("bs58check");
const KeyEncoder = require("key-encoder").default;
const { db, firestoreRef } = require("./admin");

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

module.exports = async (req, res, next) => {
  //get jwt and public token params from headers
  let jwt = req.body.jwt;
  let publickey = req.body.publickey;
  console.log(jwt);
  console.log(publickey);

  if (!jwt || !publickey) {
    console.log("Couldn't obtain headers");
    return res.status(400).json({
      general: "Error. Could not obtain jwt and publickey headers from request",
    });
  }

  //validate Jwt
  const validJwtToken = validateJwt(publickey, jwt);
  if (!validJwtToken) {
    console.log("Couldn't validate public key");
    return res.status(400).json({
      general: "Error. Invalid identification. Could not validate public key",
    });
  }

  //set req.user.id to their BitClout Public Key
  req.user = {};
  req.user.id = publickey;

  //if account hasn't been created, create it
  await db
    .doc(`/users/${req.user.id}`)
    .get()
    .then(async (doc) => {
      if (!doc.exists) {
        const blankTemplate = {
          badgesIssued: [],
          badgesReceived: [],
          badgesCreated: [],
        };
        await db.doc(`/users/${req.user.id}`).set(blankTemplate);
      }
    })
    .catch((err) => {
      console.error(err);
      return res.status(400).json({
        general: `Could not create ${req.user.id}'s data in our database.`,
      });
    });

  next();
};
