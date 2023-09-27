import os, time, glob, shutil, subprocess, traceback, json, sys
global server
server = None
reload_interval_in_seconds = 1
environment = "production"

def start_server():
    global server
    server = subprocess.Popen(["py","-m", "http.server", "8181", "--directory", "./tmp/"])


def stop_server():
    server.terminate()


def create_folder():
    try:
        os.mkdir("./tmp")
    except:
        pass


def remove_folder():
    try:
        shutil.rmtree('./tmp')
    except:
        pass


def copy_source():
    files = glob.glob('./**/*.*', recursive = True)
    for src in files:
        src = src.replace(os.sep,"/")
        if "./tmp/" in src:
            continue
        dst = src.replace("./",f"./tmp/")
        if not dst.endswith("index.html") and not "/components/" in dst:
            dst = dst.replace(".html","/index.html")
        head, tail = os.path.split(dst)
        os.makedirs(head, exist_ok=True)
        shutil.copyfile(src, dst)
    if environment == "staging":
        src = "./js/configuration-staging.js"
    elif environment == "production":
        src = "./js/configuration.js"
    else:
        raise Exception("Invalid environment, mut be staging or production")
    dst = "./tmp/js/configuration.js"
    shutil.copyfile(src, dst)


def show_activity_bar(x):
    print('\b' + x.ljust(10) + "\r", end="", flush=True)
    x += "#"
    if len(x) > 10:
        x = ""
    time.sleep(reload_interval_in_seconds)
    return x


def prepare_documentation():
    subjects = []
    indexes = {}
    for md in glob.glob('./docs/*/*.md'):
        with open(md,"r") as f:
            title = f.read().split("\n")[0].replace("# ","")
        md = md.replace(os.sep,"/").replace("./","/")
        subject = md.split("/")[2]
        if subject not in indexes:
            indexes[subject] = []
            subjects.append(subject)
        indexes[subject].append({
            "name" : title,
            "path" : md
        });
    for subject, index in indexes.items():
        with open(f"./docs/{subject}/index.json","w") as f:
            f.write(json.dumps(index,indent=2 ))
    with open("./docs/index.json","w") as f:
        index = []
        for subject in subjects:
            index += indexes[subject]
        f.write(json.dumps(index,indent=2 ))

def prepare_ide():
    code = ""
    for src in glob.glob('./js/**/*.js',recursive=True):
        src = src.replace(os.sep,"/")
        if not "js/ide/" in src:
            continue
        f = open(src,'a')
        f.close()
        with open(src,'r') as f:
            code += f.read() + "\n"
    with open("./js/ide.js","w") as f:
        f.write(code)

def watch_source():
    x = ""
    while True:
        try:
            prepare_ide()
            prepare_documentation()
            copy_source()
            x = show_activity_bar(x)
        except:
            print(traceback.format_exc())
            return


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Process some integers.')
    parser.add_argument("-m", "--merge",action='store_true')
    args = parser.parse_args()
    if args.merge:
        prepare_ide()
    else:
        print("Stop de server middels ctrl-c")
        create_folder()
        start_server()
        watch_source()
        stop_server()
        remove_folder()