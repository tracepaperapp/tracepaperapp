
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
    return Draftsman.fetch_query_parameter('drn').split(':').slice(0,x).join(':');
}

function convert_to_html(markdown){
    console.log(markdown);
    var converter = new showdown.Converter();
    var html = converter.makeHtml(markdown);
    html = html.replaceAll('<img','<img style="width:100%;"');
    console.log(html);
    return html;
}