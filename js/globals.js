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

function get_project_name(){
    return Draftsman.fetch_query_parameter('drn').split(':')[2];
}

function convert_to_html(markdown){
    var converter = new showdown.Converter();
    var html = converter.makeHtml(markdown);
    html = html.replaceAll('<img','<img style="width:100%;"');
    return html;
}

function card_filter(search,item){
    if (typeof search === 'undefined' || search === ''){
        return true;
    }
    return `${item.name} ${item.summary}`.toLowerCase().includes(search.toLowerCase());
}