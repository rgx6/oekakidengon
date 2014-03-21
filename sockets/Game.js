(function () {
    'use strict';

    var Game = (function () {
        'use strict';

        /**
         * コンストラクタ
         */
        function Game(id, name, answer, round, roundMax, viewTime, drawTime, answerTime, playerId, comment, password) {
            // ゲームのID
            this.id         = id;
            // ゲームの名前
            this.name       = name;
            // お題
            this.answer     = answer;
            // 1ゲームのラウンド数
            this.roundMax   = roundMax;
            // 1ラウンドの制限時間(見る)[秒]
            this.viewTime   = viewTime;
            // 1ラウンドの制限時間(描く)[秒]
            this.drawTime   = drawTime;
            // 答える時間[秒]
            this.answerTime = answerTime;
            // ゲームを作ったプレイヤーのID
            this.playerId   = playerId;
            // ゲームの説明
            this.comment    = comment;
            // ゲームのパスワード
            this.password   = password;

            // 現在のラウンド
            this.round      = round;
            // 現在のラウンド用のトークン
            this.roundToken = null;
            // 現在のラウンドのプレイヤーのID
            this.roundPlayerId = null;

            // お絵かきログ
            this.imagelog = [];
        }

        Game.prototype.storeImage = function (data) {
            'use strict';

            this.imagelog.push(data);
        };

        Game.prototype.deleteImage = function () {
            'use strict';

            this.imagelog.length = 0;
        };

        return Game;
    })();

    exports.Game = Game;
})();
