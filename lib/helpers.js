'use strict';

var Helpers = {};

Helpers.jidToOrganizationId = function (jid) {
    var parts = jid.match(/^(\d+)_(\d+)@.+$/) || [];

    return parseInt(parts[1], 10);
};

Helpers.jidToUserId = function (jid) {
    var parts = jid.match(/^(\d+)_(\d+)@.+$/) || [];

    return parseInt(parts[2], 10);
};

module.exports = Helpers;
