'use strict';

var async   = require('async'),
    config  = require('config'),
    lodash  = require('lodash'),
    helpers = require('./helpers'),
    Middleware;

/**
 * Middleware class. This class is responsible for holding references to plugin
 * functions and calling them sequentially whenever the bot receives a message.
 * @constructor
 * @param {Object} bot - The main bot we are attaching to
 */
Middleware = function (bot) {
    this.bot   = bot;
    this.queue = [];

    // Determine the bot's own user ID and stash it for later
    this.ownId = helpers.jidToUserId(config.botParams.jid);

    // Attach our onMessage() method to the bot's onMessage() handler
    this.bot.onMessage(lodash.bind(this.onMessage, this));
};

/**
 * Takes a callable plugin function and appends it to the middleware queue.
 * @param {Function} callable - The function to append
 */
Middleware.prototype.register = function (callable) {
    this.queue.push(callable);
};

/**
 * Message callback handler. Whenever the attached bot receives a message,
 * handle it here to build `req` and `res` objects. Also handle the middleware
 * queue and calls to the `next()` function.
 * @param {String} channel - The JID of the channel the message was posted to
 * @param {String} from - The human-readable name that sent the message
 * @param {String} message - The text content of the message
 */
Middleware.prototype.onMessage = function (channel, from, message) {
    var self = this,
        // Base request object
        req  = {
            bot        : self.bot,
            channelJid : channel,
            messageRaw : message,
            message    : message
        },
        // Base response object
        res  = {
            bot     : self.bot,
            respond : function (resMessage) {
                // Send a simple message back to the room where this request
                // was received.
                self.bot.message.call(self.bot, channel, resMessage);
            }
        };

    async.parallel({
        /**
         * When messages come in, all that is known is the human-readable name
         * of the sender. This performs a lookup against the user table to find
         * other information, such as the mentionName and user ID.
         */
        fromUser : function (cb) {
            req.bot.users.getByName(from, cb);
        },

        /**
         * If the message begins with an @mentionName, perform a lookup against
         * the user table to find other inforrmation about who this message is
         * being directed to. In this case, the `req.message` will contain the
         * message text *without* the @mentionName, while `req.messageRaw` will
         * contain the full, unmodified message text.
         */
        toUser : function (cb) {
            var parts = message.match(/^\s*@(\w+)\s+(.+)$/);

            if (parts) {
                req.message = parts[2];
                req.bot.users.getByMentionName(parts[1], cb);
            } else {
                cb(null, null);
            }
        }
    }, function (err, results) {
        // In case of an error, bail out silently
        if (err) {
            return;
        }

        // Add fromUser and toUser to the `req` object
        lodash.extend(req, results);

        // Add toOwnUser to the `req` object, and set it true if this message
        // is directed to the bot.
        req.toOwnUser = !!(req.toUser && req.toUser.id === self.ownId);

        // Set up the dispatch loop to run through the middleware queue
        (function dispatch (i) {
            var fn   = self.queue[i] || lodash.noop,
                next = function () {
                    dispatch(i + 1);
                };

            fn(req, res, next);
        })(0);
    });
};

module.exports = Middleware;
