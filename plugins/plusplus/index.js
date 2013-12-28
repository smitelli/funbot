'use strict';

// Based on https://github.com/jaredklett/PlusPlusBot

var format   = require('util').format,
    async    = require('async'),
    PlusPlus = {};

PlusPlus.THROTTLE_LIMIT = 10;  //cooldown delay before awarding again (seconds)

PlusPlus.parseAwardCommand = function (req, res) {
    // Consider en- and em-dashes as possible '--' awards
    var message = req.messageRaw.replace(/\u2013|\u2014/g, '--');

    // Pad the message with a leading and trailing space. (Makes the regexes a
    // hell of a lot simpler and more robust.)
    message = format(' %s ', message);

    var plusMatch  = message.match(/\s\+\+\s*@?(\w+)|@?(\w+)\s*\+\+\s/),
        minusMatch = message.match(/\s--\s*@?(\w+)|@?(\w+)\s*--\s/);

    if (plusMatch && minusMatch) {
        // Both a '++'' and a '--'; ignore the whole thing
        return;

    } else if (plusMatch) {
        // user++ or ++user
        req.toName = plusMatch[1] || plusMatch[2];
        req.award  = 1;

    } else if (minusMatch) {
        // user-- or --user
        req.toName = minusMatch[1] || minusMatch[2];
        req.award  = -1;

    } else {
        // No '++' and no '--'; don't continue
        return;
    }

    PlusPlus.processAward(req, res);
};

PlusPlus.processAward = function (req, res) {
    var db = req.bot.db;

    async.waterfall([
        function (cb) {
            // Make sure the user giving the points exists in the data table
            db.run('INSERT OR IGNORE INTO `plusplus_data` (`users_id`) VALUES(?)', req.fromUser.id, cb);
        },

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

        function (throttleResult, cb) {
            var err;

            if (throttleResult.length) {
                err = PlusPlus.makeErr(PlusPlus.getThrottleMessage(throttleResult[0].award_tries));

                db.run(
                    'UPDATE `plusplus_data` SET `award_tries` = `award_tries` + 1 ' +
                    'WHERE `users_id` = ?', throttleResult[0].users_id
                );

                return cb(err, null);
            }

            db.run(
                'UPDATE `plusplus_data` SET `award_tries` = 0, last_award = strftime("%s", "now") ' +
                'WHERE `users_id` = ?', req.fromUser.id,
                cb
            );
        },

        function (cb) {
            req.bot.users.getByFuzzyName(req.toName, cb);
        },

        function (result, cb) {
            var action = (req.award > 0 ? 'award yourself' : 'decrement your own'),
                err;

            // We don't need to check for result.length === 0, since
            // getByFuzzyName() will call the errback in that case.
            req.toUser = result;

            if (req.fromUser.id === req.toUser.id) {
                err = PlusPlus.makeErr("Sorry @%s, you can't %s points.", req.fromUser.mention_name, action);
                return cb(err, null);
            }

            // Make sure the user receiving the points exists in the data table
            db.run('INSERT OR IGNORE INTO `plusplus_data` (`users_id`) VALUES(?)', req.toUser.id, cb);
        },

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

        function (cb) {
            db.get('SELECT * FROM `plusplus_data` WHERE `users_id` = ?', req.toUser.id, cb);
        }
    ], function (err, result) {
        var response;

        if (err) {
            response = err.message;
        } else if (req.award > 0) {
            response = PlusPlus.getBumpMessage(req.toUser.mention_name, result.score);
        } else {
            response = PlusPlus.getDissMessage(req.toUser.mention_name, result.score);
        }

        res.respond(response);
    });
};

PlusPlus.makeErr = function () {
    var message = format.apply(null, arguments);

    return new Error(message);
};

PlusPlus.getThrottleMessage = function (tries) {
    var messages = [
        "Sorry, you're trying to award too fast.",
        "Seriously, slow your roll.",
        "Now you're just embarassing yourself."
    ];

    return messages[tries % messages.length];
};

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

module.exports = function (req, res, next) {
    var match = req.messageRaw.match(/\+\+|--|\u2013|\u2014/);

    if (match) {
        PlusPlus.parseAwardCommand(req, res);
    } else {
        return next();
    }
};
