import http from 'https://unpkg.com/isomorphic-git@beta/http/web/index.js'
const fs = new LightningFS('fs')

const dir = '/project';
const repo = 'https://github.com/tracepaperapp/test';
//const proxy = 'https://nzws7sfoublzp25dtkegh3gj2y0gebje.lambda-url.eu-west-1.on.aws';
//const proxy = 'https://cors.isomorphic-git.org'; //Idealiter vervangen door eigen proxy
//const proxy = "https://github.draftsman.io";
const proxy = "http://95.179.147.132:3636"

document.addEventListener('alpine:init', async () => {
    await git.clone({ fs, http, dir, url: repo, corsProxy: proxy });

    let files = await git.listFiles({ fs, dir: dir, ref: 'HEAD' })
    console.log(files)
    fs.readFile(dir + "/README.md","utf8",function(ret,content){
        console.log(ret);
        console.log(content);
        Alpine.store('readme', content);

        // Uit framework
        var elements = document.getElementsByClassName("data-element");
        for (var i = 0; i < elements.length; i++) {
            elements[i].dispatchEvent(new CustomEvent('refresh'));
        }
    });
})

async function save(readme){
    await fs.promises.writeFile(dir + "/README.md", readme,"utf8");
    await git.add({ fs, dir: dir, filepath: 'README.md' });

    let sha = await git.commit({
      fs,
      dir: dir,
      author: {
        name: 'Mr. Demo',
        email: 'mrdemo@example.com',
      },
      message: 'Updated README from spike'
    });
    console.log(sha);

    let pushResult = await git.push({
      fs,
      http,
      dir: dir,
      remote: 'origin',
      ref: 'main',
      onAuth: () => ({ username: "cognito-token" }),
      corsProxy: proxy
    })
    console.log(pushResult);
}

window.save = save;