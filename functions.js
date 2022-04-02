import jsSHA from 'jssha';

/**
 * Function to hash input
 * @param {string} input - input to be hashed
 */

export default function getHash(input) {
// create new SHA object
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  // generate a hashed cookie string using SHA object
  shaObj.update(input);
  return shaObj.getHash('HEX');
}
