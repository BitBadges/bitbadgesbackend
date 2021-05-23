const jsonwebtoken = require("jsonwebtoken");
const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const bs58check = require("bs58check");
const KeyEncoder = require("key-encoder").default;

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

  // if the jwt or public key is invalid this will throw an error
  const result = jsonwebtoken.verify(
    jwtToken,
    rawPublicKeyEncoded,
    {
      algorithms: ["ES256"],
    },
    function (err, decoded) {
      if (err) {
        return false;
      }
    }
  );

  return true;
}

module.exports = (req, res, next) => {
  let jwt = req.headers.jwt;
  let publickey = req.headers.publickey;

  const validJwtToken = validateJwt(publickey, jwt);
  if (!validJwtToken) {
    return res
      .status(400)
      .json({
        general: "Error. Invalid identification. Could not validate public key",
      });
  }
  req.user = {};
  req.user.id = publickey;
  next();
};
