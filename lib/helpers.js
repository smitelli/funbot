'use strict';

var Helpers = {};

Helpers.jidToOrganizationId = function (jid) {
    var parts = jid.match(/^(\d+)_(\d+)@.+$/) || [];

    return parts[1];
};

Helpers.jidToUserId = function (jid) {
    var parts = jid.match(/^(\d+)_(\d+)@.+$/) || [];

    return parts[2];
};

module.exports = Helpers;
