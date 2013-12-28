'use strict';

var async      = require('async'),
    config     = require('config'),
    lodash     = require('lodash'),
    helpers    = require('./helpers'),
    Middleware = function (bot) {
        this.bot   = bot;
        this.ownId = helpers.jidToUserId(config.botParams.jid);
        this.queue = [];

        bot.onMessage(lodash.bind(this.onMessage, this));
    };

Middleware.prototype.register = function (callable) {
    this.queue.push(callable);
};

Middleware.prototype.onMessage = function (channel, from, message) {
    var req = {
            bot        : this.bot,
            ownId      : this.ownId,
            channelJid : channel,
            messageRaw : message,
            message    : message
        },
        res = {
            bot  : this.bot,
            send : this.bot.message
        };

    async.parallel({
        fromUser : function (cb) {
            req.bot.users.getByName(from, cb);
        },

        toUser : function (cb) {
            var parts = message.match(/^@(\w+)\s+(.+)$/);

            if (parts) {
                req.message = parts[2];
                req.bot.users.getByMentionName(parts[1], cb);
            } else {
                cb(null, null);
            }
        }
    }, function (err, results) {
        if (err) {
            return;
        }

        lodash.extend(req, results);

        req.toOwnUser = !!(req.toUser && req.toUser.id === req.ownId);

        console.log(req);
    });
};

module.exports = Middleware;
