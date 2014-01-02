'use strict';

// All messages ganked from https://github.com/jaredklett/PlusPlusBot

var format = require('util').format;

/**
 * Gets a random line of canned snark.
 * @param {String} mentionName - The user mentionName that sent the message
 * @return {String} A line of snark
 */
function getSnarkMessage (mentionName) {
    var messages = [
        "@%s, that's so creative of you.",
        "@%s, you have such a way with words.",
        "@%s, you must really really like me!",
        "@%s, I'm not sure if I should dignify that with a response.",
        "@%s, I wuv you too.",
        "@%s, that just warms my the cockles of my CPU.",
        "@%s, do you need a time out?"
    ];

    return format(messages[Math.floor(Math.random() * messages.length)], mentionName);
}

/**
 * This is meant to be a "catch-all" handler for instances when a message was
 * sent to the bot but no other handler could act on the command. It always
 * returns a snarky comment, regardless of the request message.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next plugin in the chain; will be called if this
 *        plugin determines no action should be taken.
 */
module.exports = function (req, res, next) {
    // Do not do anything if this message was not directed to the bot
    if (!req.toOwnUser) {
        return next();
    }

    // Echo the request text into the response
    res.respond(getSnarkMessage(req.fromUser.mention_name));
};
