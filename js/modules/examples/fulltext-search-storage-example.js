document.addEventListener('alpine:init', () => {
    Alpine.data('notesModule', function(){
        return {
            noteQuery: this.$persist(""),
            noteText: this.$persist(""),
            notes: [],
            sequence: this.$persist(1),
            getAllHack: "7b12a31d-73fa-4bdc-b379-5a3d98f1bebf",
            async init(){
                this.noteIndex = await SearchIndex.open('notes', ['note','getAllHack']);
                this.search_notes();
            },
            async save_note(){
                let note = {note: this.noteText,id: this.sequence, getAllHack: this.getAllHack};
                await this.noteIndex.addDocuments([note]);
                this.noteText = "";
                this.notes.unshift(note);
                this.sequence++;
            },
            async search_notes(){
                this.notes = await this.noteIndex.search(this.noteQuery ? this.noteQuery : this.getAllHack);
            },
            async delete_note(){
                await Promise.all(this.notes.filter(x => x.deleted).map(x => this.noteIndex.removeDocuments({
                    id: x.id,
                    note: x.note,
                    getAllHack: x.getAllHack
                })));
                await this.search_notes();
            }
        }
    });
});