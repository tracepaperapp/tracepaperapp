import os, time, glob, shutil, subprocess, traceback
global server
server = None
reload_interval_in_seconds = 3
environment = "staging"
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


def watch_source():
    x = ""
    while True:
        try:
            copy_source()
            x = show_activity_bar(x)
        except:
            print(traceback.format_exc())
            return


if __name__ == "__main__":
    print("Stop de server middels ctrl-c")
    create_folder()
    start_server()
    watch_source()
    stop_server()
    remove_folder()