var server = require('../server.js');
var app = require('../sockets/app.js');

// タイトル
var appTitle = 'お絵かき伝言ゲーム';

// 定数
var playerNameLengthMax = app.PLAYER_NAME_LENGTH_MAX;
var answerLengthMax     = app.ANSWER_LENGTH_MAX;
var gameNameLengthMax   = app.GAME_NAME_LENGTH_MAX;
var commentLengthMax    = app.COMMENT_LENGTH_MAX;
var passwordLengthMax   = app.PASSWORD_LENGTH_MAX;
var roundMin            = app.ROUND_MIN;
var roundMax            = app.ROUND_MAX;
var viewTimeMin         = app.VIEW_TIME_MIN;
var viewTimeMax         = app.VIEW_TIME_MAX;
var drawTimeMin         = app.DRAW_TIME_MIN;
var drawTimeMax         = app.DRAW_TIME_MAX;
var answerTimeMin       = app.ANSWER_TIME_MIN;
var answerTimeMax       = app.ANSWER_TIME_MAX;

var roundDefault        = app.ROUND_DEFAULT;

// エラーメッセージ
var msgSystemError = 'システムエラー(´・ω・｀)';
var msgInvalidUrl = 'そんなページないよ(´・ω・｀)';

/**
 * routing
 */

exports.index = function (req, res) {
    'use strict';

    res.render('index', {
        title: appTitle,
        playerNameLengthMax: playerNameLengthMax,
        answerLengthMax:     answerLengthMax,
        gameNameLengthMax:   gameNameLengthMax,
        commentLengthMax:    commentLengthMax,
        passwordLengthMax:   passwordLengthMax,
        roundMin:            roundMin,
        roundMax:            roundMax,
        viewTimeMin:         viewTimeMin,
        viewTimeMax:         viewTimeMax,
        drawTimeMin:         drawTimeMin,
        drawTimeMax:         drawTimeMax,
        answerTimeMin:       answerTimeMin,
        answerTimeMax:       answerTimeMax,
        roundDefault:        roundDefault,
    });
};

exports.draw = function (req, res) {
    'use strict';

    res.render('draw', {
        title: appTitle,
    });
};

exports.watch = function (req, res) {
    'use strict';

    res.render('watch', {
        title: appTitle,
    });
};

exports.answer = function (req, res) {
    'use strict';

    res.render('answer', {
        title:           appTitle,
        answerLengthMax: answerLengthMax,
    });
};

exports.result = function (req, res) {
    'use strict';

    res.render('result', {
        title: appTitle
    });
};

// exports.help = function (req, res) {
//     'use strict';

//     res.render('help', {
//         title: appTitle
//     });
// };

// exports.ranking = function (req, res) {
//     'use strict';

//     res.render('ranking', {
//         title: appTitle
//     });
// };
