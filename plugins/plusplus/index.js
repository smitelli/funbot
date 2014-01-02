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
 * silently ignore the request.
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
 * Handles any commands directed at the bot starting with "plusplus" as the
 * first word.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
PlusPlus.parseMetaCommand = function (req, res) {
    var commandParts = req.metaCommand.split(/\s+/);

    if (commandParts[0] === 'scores') {
        // User wants the list of all scores
        PlusPlus.processScoreListQuery(req, res);
        return;

    } else if (commandParts[0] === 'score') {
        // User wants the scores for a particular user; read the next word
        req.queryName = commandParts[1];

        PlusPlus.processScoreUserQuery(req, res);
        return;

    } else if (commandParts[0] === '') {
        // The command is missing
        res.respond("Sorry, I didn't catch that.");
        return;

    } else {
        // The command is not a valid keyword
        res.respond(
            format("@%s Sorry, I don't understand the command '%s'.", req.fromUser.mention_name, commandParts[0])
        );
        return;
    }
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
            var action = (req.award > 0) ? 'award yourself' : 'decrement your own',
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
        var fn = (req.award > 0) ? 'getBumpMessage' : 'getDissMessage',
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
 * Process a command to list the current scores of all known users.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
PlusPlus.processScoreListQuery = function (req, res) {
    // Query for the names and scores of all users in the data table
    req.bot.db.all(
        'SELECT * FROM `plusplus_data` ' +
        'LEFT JOIN `users` ON `plusplus_data`.`users_id` = `users`.`id` ' +
        'WHERE `users`.`id` IS NOT NULL',
        function (err, results) {
            var response;

            if (err) {
                // Some sort of unhandled error
                response = "Sorry, something is wrong at the moment.";
            } else if (!results.length) {
                // Query ran okay, but zero results were returned
                response = "Sorry, I don't have any scores to report.";
            } else {
                // Got results; build the score table
                response = results.map(function (row) {
                    var points = (row.score === 1) ? 'point' : 'points';
                    return format('@%s (%s) ..... %d %s', row.mention_name, row.name, row.score, points);
                }).join('\n');
            }

            res.respond(response);
        }
    );
};

/**
 * Process a command to list the current scores of one specific user.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
PlusPlus.processScoreUserQuery = function (req, res) {
    async.waterfall([
        /**
         * Ensure we were actually given a user name.
         */
        function (cb) {
            var err = new Error(
                "Sorry, you have to ask about a specific user. " +
                "For example: plusplus score @<nick>"
            );

            if (!req.queryName) {
                return cb(err, null);
            }

            cb();
        },

        /**
         * Try to figure out which user row the supplied name refers to.
         */
        function (cb) {
            req.bot.users.getByFuzzyName(req.queryName, cb);
        },

        /**
         * Fetch the user's score data from the table.
         */
        function (userRow, cb) {
            req.bot.db.get(
                'SELECT * FROM `users` LEFT JOIN `plusplus_data` ' +
                'ON `users`.`id` = `plusplus_data`.`users_id` ' +
                'WHERE `users`.`id` = ?', userRow.id,
                cb
            );
        }
    ], function (err, result) {
        var response;

        if (err) {
            // Some sort of unhandled error
            response = err.message;
        } else if (result.score === null) {
            // User doesn't have any points registered
            response = format("Sorry, but @%s hasn't received any points yet.", result.mention_name);
        } else {
            // Found the user; report their score
            var points = (result.score === 1) ? 'point' : 'points';
            response = format('@%s (%s) ..... %d %s', result.mention_name, result.name, result.score, points);
        }

        res.respond(response);
    });
    res.queryUser;
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
 * @return {String} The next response message
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
 * @return {String} A random, filled-in response message
 */
PlusPlus.getBumpMessage = function (toMentionName, score) {
    var messages = [
        "w00t! @%s now at %d!",
        "Nice! @%s now at %d!",
        "Suh-weet! @%s now at %d!",
        "Well played! @%s now at %d!",
        "Zing! @%s now at %d!",
        "You go girl! @%s now at %d!",
        "Booyakasha! @%s now at %d!",
        "Heyoooo! @%s now at %d!",
        "Sweet! @%s now at %d!",
        "Fist bump! @%s now at %d!"
    ];

    return format(messages[Math.floor(Math.random() * messages.length)], toMentionName, score);
};

/**
 * Gets a response message for cases when the award causes the recipient's score
 * to decrease. The responses are chosen randomly and filled with information
 * from the arguments.
 * @param {String} toMentionName - The mentionName of the user being awarded
 * @param {Number} score - The new score
 * @return {String} A random, filled-in response message
 */
PlusPlus.getDissMessage = function (toMentionName, score) {
    var messages = [
        "Ouch! @%s now at %d!",
        "Daaaang! @%s now at %d!",
        "Denied! @%s now at %d!",
        "Ooooh! @%s now at %d!",
        "Owie! @%s now at %d!",
        "Awwww snap! @%s now at %d!",
        "Ya dun goofed! @%s now at %d!",
        "Boom! @%s now at %d!",
        "Oh no you did not! @%s now at %d!"
    ];

    return format(messages[Math.floor(Math.random() * messages.length)], toMentionName, score);
};

/**
 * This plugin will check every message for a "++" or "--" award. If either is
 * found, the parser will handle the processing.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next plugin in the chain; will be called if this
 *        plugin determines no action should be taken.
 */
module.exports = function (req, res, next) {
    // Award symbols are "++" and "--". We accept en-dash/em-dash as "--" too.
    // Meta commands are directed at the bot and start with 'plusplus'.
    var awardMatch   = req.messageRaw.match(/\+\+|--|\u2013|\u2014/),
        commandMatch = req.toOwnUser && req.message.match(/^plusplus\s*(.*?)$/i);

    // If the message contains award commands, parse them
    if (awardMatch) {
        PlusPlus.parseAwardCommand(req, res, next);
        return;
    }

    // If the message is directed at the bot, it could be a meta command
    if (commandMatch) {
        req.metaCommand = commandMatch[1];

        PlusPlus.parseMetaCommand(req, res);
        return;
    }

    // Nothing to do; pass off to the next handler
    return next();
};
