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
    var self = this,
        req  = {
            bot        : self.bot,
            ownId      : self.ownId,
            channelJid : channel,
            messageRaw : message,
            message    : message
        },
        res  = {
            bot  : self.bot,
            respond : function (text) {
                self.bot.message.call(self.bot, channel, text);
            }
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

        (function dispatch (i) {
            var callable = self.queue[i] || lodash.noop,
                next     = function () {
                    dispatch(i + 1);
                };

            callable(req, res, next);
        })(0);
    });
};

module.exports = Middleware;
