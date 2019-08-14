// JSDoc のタイプチェックに型を認識させるため
let Op = require("./op").Op; // eslint-disable-line
let Stats = require("./stats").GenericStats; // eslint-disable-line

class Konata{
    constructor(){
        this.name = "Konata";
        this.parser_ = null;
        this.FileReader_ = require("./file_reader").FileReader;
        this.OnikiriParser_ = require("./onikiri_parser").OnikiriParser;
        this.Gem5O3PipeViewParser_ = require("./gem5_o3_pipe_view_parser").Gem5O3PipeViewParser;

        this.file_ = null;
        this.filePath_ = ""; 
        // Callback handlers
        this.updateCallback_ = null;
        this.finishCallback_ = null;
        this.errorCallback_ = null;
        this.closed_ = false;
    }

    close(){
        this.closed_ = true;
        if (this.parser_) {
            this.parser_.close();
            this.parser_ = null;
        }
        if (this.file_){
            this.file_.close();
            this.file_ = null;
            console.log(`Closed: ${this.filePath_}`);
        }

        // GC を走らせておく
        if (global.gc) {
            console.log("Run GC");
            global.gc();            
        }
    }

    openFile(path, updateCallback, finishCallback, errorCallback){
        this.filePath_ = path;
        this.updateCallback_ = updateCallback;
        this.finishCallback_ = finishCallback;
        this.errorCallback_ = errorCallback;

        this.reload();
    }

    reload(){
        let parsers = [
            new this.OnikiriParser_(),
            new this.Gem5O3PipeViewParser_()
        ];
        this.load_(parsers);
    }

    /**
     * 与えられた parser を使ってファイルのロードを試みる
     * @param {array} parsers - パーサーのリスト．先頭から順に読み出し試行される
     */
    load_(parsers){
        this.close();
        this.file_ = new this.FileReader_();
        this.file_.open(this.filePath_);

        this.parser_ = parsers.shift();
        console.log(`Open (${this.parser_.name}): ${this.filePath_}`);

        let self = this;
        this.parser_.setFile(
            this.file_, 
            this.updateCallback_, 
            function(){ // Finish handler
                if (self.file_) {
                    self.file_.close(); // The parser must not be closed.
                }
                self.finishCallback_();
            },
            function(){ // Error handler
                console.log("Filed to load by:", self.parser_.name);
                self.close();
                // 読み出し試行に失敗したの次のパーサーに
                if (parsers.length > 0) {
                    self.load_(parsers);
                }
                else if (parsers.length == 0) {
                    self.errorCallback_("Unsupported file format.");
                }
            }
        );
    }

    /**
     * @return {Op} id に対応した op を返す
     */
    getOp(id){
        return this.parser_ ? this.parser_.getOp(id) : null;
    }

    getOpFromRID(rid){
        return this.parser_ ? this.parser_.getOpFromRID(rid) : null;
    }

    get lastID(){
        return this.parser_ ? this.parser_.lastID : 0;
    }

    get lastRID(){
        return this.parser_ ? this.parser_.lastRID : 0;
    }

    get laneMap(){
        return this.parser_ ? this.parser_.laneMap : {};
    }

    get stageLevelMap(){
        return this.parser_ ? this.parser_.stageLevelMap : {};
    }

    // パイプライン中の統計を計算し，終わったら finish に渡す
    async stats(update, finish){
        let lastID = this.lastID;

        let stats = new Stats(this);
        let sleepTimer = 0;
        let SLEEP_INTERVAL = 50000;

        for (let i = 0; i < lastID; i++) {
            let op = this.getOp(i);
            if (op == null) {
                continue;
            }
            stats.update(op);

            // 一定時間毎に setTimeout でその他の処理への切り替えを入れる
            if (sleepTimer > SLEEP_INTERVAL) {
                sleepTimer = 0;
                update(i / lastID, i / SLEEP_INTERVAL);
                await new Promise(r => setTimeout(r, 0));
                if (this.closed_){
                    break;
                }
            }
            sleepTimer++;
        }

        stats.finish();
        finish(stats.stats);
    }

}

module.exports.Konata = Konata;
