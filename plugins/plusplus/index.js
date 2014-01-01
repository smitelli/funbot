'use strict';

// Based on (and messages ganked from) https://github.com/jaredklett/PlusPlusBot

var format   = require('util').format,
    async    = require('async'),
    PlusPlus = {};

/**
 * Cooldown delay before a user can award points again (seconds).
 */
PlusPlus.THROTTLE_LIMIT = 10;

/**
 * Analyzes the request message to determine if it contains an award command. If
 * it does, figure out who's getting the award and if it increases or decreases
 * that user's score. This is the last method where the bot can choose to
 * gracefully ignore the request.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next plugin in the chain; will be called if this
 *        plugin determines no action should be taken.
 */
PlusPlus.parseAwardCommand = function (req, res, next) {
    // Consider en- and em-dashes as possible '--' awards
    var message = req.messageRaw.replace(/\u2013|\u2014/g, '--');

    // Pad the message with a leading and trailing space. Makes the regexes a
    // hell of a lot simpler and more robust.
    message = format(' %s ', message);

    var plusMatch  = message.match(/\s\+\+\s*@?(\w+)|@?(\w+)\s*\+\+\s/),
        minusMatch = message.match(/\s--\s*@?(\w+)|@?(\w+)\s*--\s/);

    if (plusMatch && minusMatch) {
        // Both a '++'' and a '--'; ignore the whole thing
        return next();

    } else if (plusMatch) {
        // user++ or ++user; increase the score
        req.toName = plusMatch[1] || plusMatch[2];
        req.award  = 1;

    } else if (minusMatch) {
        // user-- or --user; decrease the score
        req.toName = minusMatch[1] || minusMatch[2];
        req.award  = -1;

    } else {
        // No '++' and no '--'; should never happen, but don't continue
        return next();
    }

    // The command has been parsed, now process it
    PlusPlus.processAward(req, res);
};

/**
 * Process a command to increase/decrease a user's score. The bot *must* send
 * some sort of response once inside this method.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
PlusPlus.processAward = function (req, res) {
    var db = req.bot.db;

    async.waterfall([
        /**
         * Ensure the user giving the points exists in the data table.
         */
        function (cb) {
            db.run('INSERT OR IGNORE INTO `plusplus_data` (`users_id`) VALUES(?)', req.fromUser.id, cb);
        },

        /**
         * Query the DB to see if this user has sent an award command within the
         * last `THROTTLE_LIMIT` seconds. If they have, this query will return a
         * row. Otherwise, no rows will be returned.
         */
        function (cb) {
            db.all(
                'SELECT * FROM `plusplus_data` WHERE `users_id` = $id ' +
                'AND `last_award` > strftime("%s", "now") - $lim',
                {
                    $id  : req.fromUser.id,
                    $lim : PlusPlus.THROTTLE_LIMIT
                },
                cb
            );
        },

        /**
         * Receives the throttleResult row from the previous function. If there
         * is a row, it means this user is awarding too quickly -- increment the
         * `tries` column for that user and stop with an error message. On the
         * other hand, if there were no throttleResult rows returned, this award
         * is valid and should continue -- clear their `tries` column and update
         * the `last_award` column to the current time.
         * @param {Array} throttleResult - The DB rows returned from the
         *        previous function.
         */
        function (throttleResult, cb) {
            var err;

            if (throttleResult.length > 0) {
                // User is awarding too fast; bail out
                err = PlusPlus.makeErr(PlusPlus.getThrottleMessage(throttleResult[0].award_tries));

                db.run(
                    'UPDATE `plusplus_data` SET `award_tries` = `award_tries` + 1 ' +
                    'WHERE `users_id` = ?', throttleResult[0].users_id
                );

                return cb(err, null);
            }

            // User is not awarding too fast; update their row
            db.run(
                'UPDATE `plusplus_data` SET `award_tries` = 0, last_award = strftime("%s", "now") ' +
                'WHERE `users_id` = ?', req.fromUser.id,
                cb
            );
        },

        /**
         * Try to determine which username this award is going to. If no match
         * is found, or the match is deemed to be ambiguous, getByFuzzyName()
         * will call the callback with an appropriate error message.
         */
        function (cb) {
            req.bot.users.getByFuzzyName(req.toName, cb);
        },

        /**
         * This function takes the user row for the award recipient and handles
         * the actual score processing.
         * @param {Object} result - The award recipient's user row
         */
        function (result, cb) {
            var action = (req.award > 0 ? 'award yourself' : 'decrement your own'),
                err;

            // We don't need to check for result.length === 0, since
            // getByFuzzyName() would have called the errback in that case.
            req.toUser = result;

            // Don't allow a user to direct an award to themselves
            if (req.fromUser.id === req.toUser.id) {
                err = PlusPlus.makeErr("Sorry @%s, you can't %s points.", req.fromUser.mention_name, action);
                return cb(err, null);
            }

            // Ensure the user receiving the points exists in the data table
            db.run('INSERT OR IGNORE INTO `plusplus_data` (`users_id`) VALUES(?)', req.toUser.id, cb);
        },

        /**
         * Update the score for this user.
         */
        function (cb) {
            db.run(
                'UPDATE `plusplus_data` SET `score` = `score` + $award WHERE `users_id` = $users_id',
                {
                    $award    : req.award,
                    $users_id : req.toUser.id
                },
                cb
            );
        },

        /**
         * Select the recipient's user row (which should have the new score) and
         * return it as the main result of this waterfall operation.
         */
        function (cb) {
            db.get('SELECT * FROM `plusplus_data` WHERE `users_id` = ?', req.toUser.id, cb);
        }
    ], function (err, result) {
        var fn = (req.award > 0 ? 'getBumpMessage' : 'getDissMessage'),
            response;

        if (err) {
            response = err.message;
        } else {
            response = PlusPlus[fn](req.toUser.mention_name, result.score);
        }

        res.respond(response);
    });
};

/**
 * Helper method to create an Error instance with a message that has been
 * format()ted. The method signature is identical to that of util.format().
 * @return {Object} Instance of Error which contains the formatted message
 */
PlusPlus.makeErr = function () {
    var message = format.apply(null, arguments);

    return new Error(message);
};

/**
 * Gets a response message for cases when the requester is awarding too fast.
 * Rotates through the message list sequentially based on how many `tries` have
 * been attempted so far.
 * @param {Number} tries - How many attempts have been made while throttled
 * @return {String} A response message
 */
PlusPlus.getThrottleMessage = function (tries) {
    var messages = [
        "Sorry, you're trying to award too fast.",
        "Seriously, slow your roll.",
        "Now you're just embarassing yourself."
    ];

    return messages[tries % messages.length];
};

/**
 * Gets a response message for cases when the award causes the recipient's score
 * to increase. The responses are chosen randomly and filled with information
 * from the arguments.
 * @param {String} toMentionName - The mentionName of the user being awarded
 * @param {Number} score - The new score
 */
PlusPlus.getBumpMessage = function (toMentionName, score) {
    var messages = [
        "w00t! @%s now at %d!",
        "nice! @%s now at %d!",
        "suh-weet! @%s now at %d!",
        "well played! @%s now at %d!",
        "zing! @%s now at %d!",
        "you go girl! @%s now at %d!",
        "booyakasha! @%s now at %d!",
        "heyoooo! @%s now at %d!",
        "sweet! @%s now at %d!",
        "fist bump! @%s now at %d!"
    ];

    return format(messages[Math.floor(Math.random() * messages.length)], toMentionName, score);
};

/**
 * Gets a response message for cases when the award causes the recipient's score
 * to decrease. The responses are chosen randomly and filled with information
 * from the arguments.
 * @param {String} toMentionName - The mentionName of the user being awarded
 * @param {Number} score - The new score
 */
PlusPlus.getDissMessage = function (toMentionName, score) {
    var messages = [
        "ouch! @%s now at %d!",
        "daaaang! @%s now at %d!",
        "denied! @%s now at %d!",
        "ooooh! @%s now at %d!",
        "owie! @%s now at %d!",
        "awwww snap! @%s now at %d!",
        "ya dun goofed! @%s now at %d!",
        "boom! @%s now at %d!",
        "oh no you did not! @%s now at %d!"
    ];

    return format(messages[Math.floor(Math.random() * messages.length)], toMentionName, score);
};

/**
 * This plugin will check every message for a "++" or "--" award. If one is
 * found, the parser will handle the processing.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next plugin in the chain; will be called if this
 *        plugin determines no action should be taken.
 */
module.exports = function (req, res, next) {
    // Award symbols are "++" and "--". We accept en-dash/em-dash as "--" too.
    var match = req.messageRaw.match(/\+\+|--|\u2013|\u2014/);

    // If the message doesn't contain award symbols, there's no point continuing
    if (!match) {
        return next();
    }

    // Parse the command
    PlusPlus.parseAwardCommand(req, res, next);
};
