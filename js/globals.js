var must_be_signed_in = true;

function fetch_data(element){
    var data = Alpine.store(element.$prop('alias'));
    element.$prop('path').split('.').forEach(key =>{
        console.log(key,data);
        data = data[key];
        console.log(data);
    });
    return data;
}

function get_drn(x){
    if (x){
        return Draftsman.fetch_query_parameter('drn').split(':').slice(0,x).join(':');
    } else {
        return Draftsman.fetch_query_parameter('drn');
    }
}

function convert_to_html(markdown){
    var converter = new showdown.Converter();
    var html = converter.makeHtml(markdown);
    html = html.replaceAll('<img','<img style="width:100%;"');
    return html;
}