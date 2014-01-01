'use strict';

var Helpers = {};

/**
 * Given a JID in the form "12345_67890@domain.com", returns the organization
 * ID, which in this case would be the number 12345.
 * @param {String} jid - The JID to parse
 * @return {Number} The organization ID as a number
 */
Helpers.jidToOrganizationId = function (jid) {
    var parts = jid.match(/^(\d+)_(\d+)@.+$/) || [];

    return parseInt(parts[1], 10);
};

/**
 * Given a JID in the form "12345_67890@domain.com", returns the user ID, which
 * in this case would be the number 67890.
 * @param {String} jid - The JID to parse
 * @return {Number} The user ID as a number
 */
Helpers.jidToUserId = function (jid) {
    var parts = jid.match(/^(\d+)_(\d+)@.+$/) || [];

    return parseInt(parts[2], 10);
};

module.exports = Helpers;
