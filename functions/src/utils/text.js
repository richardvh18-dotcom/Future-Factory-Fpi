const clean = (val) => String(val || '').trim();

const clampText = (value, maxChars) => String(value || '').slice(0, maxChars);

module.exports = {
  clean,
  clampText,
};
