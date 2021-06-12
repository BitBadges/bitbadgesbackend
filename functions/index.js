const functions = require("firebase-functions");
const { db, firestoreRef } = require("./utils/admin");
const app = require("express")();
const cors = require("cors");
app.use(cors());

const {
  addPage,
  deletePage,
  getUserInfo,
  getUsername,
  getPublicKey,
  getHodlers,
} = require("./handlers/users");

const { getBadge, createBadge } = require("./handlers/badges");

const {
  getAllBadgePages,
  getBadgePage,
  createBadgePage,
  deleteBadgePage,
} = require("./handlers/badgePages");

const BadgePaywall = require("./utils/BadgePaywall");
const UserAuth = require("./utils/UserAuth");
const getFeeTransaction = require("./utils/getFeeTxn");
/**
 * Getter methods for all values in the database - look at dbschema.js for return formats of each function
 */
app.get("/users/:id", getUserInfo);
app.get("/badges/:id", getBadge);
app.get("/badgePages/:id", getBadgePage);

app.get("/badgePages", getAllBadgePages);
app.get("/username/:publicKey", getUsername);
app.get("/publicKey/:userName", getPublicKey);

app.get("/feeTxn/:senderKey/:numRecipients", getFeeTransaction);

app.post("/hodlers", getHodlers);

/**
 * Issues a badge from current user to a seleted recipient
 *
 * req.body must match dbschema.js format for a badge minus id field
 *
 * Will update both issuer and recipient's user badgesIssued/Received arrays accordingly
 *
 * Will also post on BitClout a hash of the IPFS Id with issuer and receiver to be stored on the BitClout chain
 */
app.post("/badges", UserAuth, BadgePaywall, createBadge);

/**
 * Issues a badge page with current user as the recipient
 *
 * req.body must match dbschema.js format for a badgePage
 *
 * Will append newly created id to the currentUser's badgesCreated array
 */
app.post("/badgePages", UserAuth, createBadgePage);
/**
 * Deletes specified badge page of the current user by id from both badgePages array and user's badgesCreated array
 */
app.delete("/badgePages/:id", UserAuth, deleteBadgePage);

/**
 * Adds a page to the user's portfolio display
 *
 * req.body must match format specified in dbschema.js for a single page
 *    -so req.body.pageTitle and req.body.badges must be valid
 * req.body.pageNum additionally must be specified for where to place page in array (indices start from 0)
 *      -new page will be placed at specified pageNum and everything will be shifted to the right
 *
 * Badges in badge array must exist
 */
app.post("/users/portfolioPages", UserAuth, addPage);

/**
 * Deletes a page from the user's portfolio display
 *
 * req.body.pageNum must specify what pageNum to delete (indices start from 0)
 *      -everything in array will be shifted to the left to close the gap
 */
app.delete("/users/portfolioPages", UserAuth, deletePage);

exports.api = functions.https.onRequest(app);
