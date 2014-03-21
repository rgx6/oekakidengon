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

            // お絵かきログ
            this.imagelog = [];
        }

        // todo : 実装
        /**
         * 送られてきた描画データを処理する
         */
        // Game.prototype.procImage = function (data, playerName) {
        //     if (data.length === 1 && data[0].type === 'fill') {
        //         this.imagelog.length = 0;
        //         this.imagelog.push(data);
        //     }
        //     else {
        //         this.imagelog.push(data);
        //     }

        //     // 通信量削減のため描いた人には送らない
        //     for (var i = 0; i < this.players.length; i += 1) {
        //         if (this.players[i].name !== playerName) {
        //             this.players[i].socket.emit('push image', data);
        //         }
        //     }
        // };

        return Game;
    })();

    exports.Game = Game;
})();
