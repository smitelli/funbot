'use strict';

/**
 * This is a dummy/example plugin that responds to any message directed at the
 * bot that begins with the word "echo". The bot will respond verbatim with
 * everything that appeared after the keyword.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next plugin in the chain; will be called if this
 *        plugin determines no action should be taken.
 */
module.exports = function (req, res, next) {
    var match;

    // Do not do anything if this message was not directed to the bot
    if (!req.toOwnUser) {
        return next();
    }

    match = req.message.match(/^\s*echo\s+(.+)$/i);

    // Do not do anything if this message doesn't begin with "echo "
    if (!match) {
        return next();
    }

    // Echo the request text into the response
    res.respond(match[1]);
};
