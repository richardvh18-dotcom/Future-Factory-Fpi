const { db } = require('../config/firebase');
const { USER_ACCOUNTS_COLLECTION } = require('../config/planningConstants');
const { clean } = require('../utils/text');

const resolveUserRoleForContext = async (context) => {
  const tokenRole = clean(context?.auth?.token?.role).toLowerCase();
  if (tokenRole) return tokenRole;

  const uid = context?.auth?.uid;
  if (!uid) return '';

  const userSnap = await db.collection(USER_ACCOUNTS_COLLECTION).doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  return clean(userData?.role).toLowerCase();
};

module.exports = {
  resolveUserRoleForContext,
};
