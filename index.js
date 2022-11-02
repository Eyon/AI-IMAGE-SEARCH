const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require('axios')
const CryptoJS = require('crypto-js')
const qiniu = require('qiniu')
var FormData = require('form-data');

// const { init: initDB, Counter } = require("./db");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);


bucket = 'ai-image-transfer';

const accessKey = "lqVEs_5UpHdzGW5lDifNqeY7XRqbpb9VCRRPBmT1";
const secretKey = "ctmQ5A_oqwDTx7_Ys-YoeE22GvxGG_uFf6qnvvq6"



var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
var bucketManager = new qiniu.rs.BucketManager(mac, config);


app.get('/', (req, res) => res.send('running'))

app.post('/api', async (req, res) => {
    const { q } = req.body

    const re = /[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/

    if (re.exec(q)) {
        var result = await axios.get(`https://lexica.art/api/v1/search?q=${'http://temp-image.serviceforapple.com/'+q}`)
        result=result.data.images.slice(0,20)
    } else {
        const translation = await translate(q)
        if (translation.errorCode !== 0) {
            return res.send(translation)

        }
        var result = await axios.get(`https://lexica.art/api/v1/search?q=${translation.msg}`)
        result = result.data.images.slice(0,20)
    }


    var promises = []
    
    result.map(item => {
        promises.push(new Promise(resolve => {
            bucketManager.fetch(`https://lexica-serve-encoded-images.sharif.workers.dev/sm/${item.id}`, bucket, item.id, (e, r, b) => { resolve(true) })
            item.srcSmall = 'http://temp-image.serviceforapple.com/' + item.id
        }))
    })

    Promise.all(promises).then(() => res.send(result))
})

app.post('/api/getmdimage', async (req, res) => {
    const { id } = req.body
    const sourceurl = 'https://lexica-serve-encoded-images.sharif.workers.dev/md/'
    const promise = new Promise((resolve, reject) => bucketManager.fetch(sourceurl + id, bucket, 'md-' + id, (e, r, b) => {
        if (e) {
            reject(e)
        } else {
            resolve({
                url: 'http://temp-image.serviceforapple.com/' + 'md-' + id
            })
        }
    }))
    const result = await promise
    res.send(result)
})

app.post('/api/translate',async(req,res)=>{
    const {q} = req.body
    const result = await translate(q,from="en",to="zh-CHS")
    res.send(result)
})

async function translate(word,from="zh-CHS",to="en") {

    var appKey = '4940b16dbb6d22bf';
    var key = 'l6tUIS4Aym5mj7jdKqJ0bvKF01kEZuEj';
    var salt = (new Date).getTime();
    var curtime = Math.round(new Date().getTime() / 1000);
    var str1 = appKey + truncate(word) + salt + curtime + key;
    var sign = CryptoJS.SHA256(str1).toString(CryptoJS.enc.Hex);

    var params = {
        q: word,
        appKey: appKey,
        salt: salt,
        from: from,
        to: to,
        sign: sign,
        signType: "v3",
        curtime: curtime
    }
    const formData = new FormData();
    Object.keys(params).forEach((key) => {
        formData.append(key, params[key]);
    });

    const result = await axios.post('https://openapi.youdao.com/api', formData, { headers: formData.getHeaders() })
    if (result.data.errorCode === "0") {
        return {
            errorCode: 0,
            msg: result.data.translation[0]
        }
    } else {
        return {
            errorCode: result.data.errorCode,
            msg: "发生错误，请确保你搜索的内容合法合规"
        }
    }

    function truncate(q) {
        var len = q.length;
        if (len <= 20) return q;
        return q.substring(0, 10) + len + q.substring(len - 10, len);
    }
}



const port = process.env.PORT || 80;

async function bootstrap() {
  // await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
