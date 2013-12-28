'use strict';

module.exports = function (req, res, next) {
    var match = req.message.match(/^echo\s+(.+)$/i);

    if (match) {
        res.respond(match[1]);
    } else {
        return next();
    }
};
