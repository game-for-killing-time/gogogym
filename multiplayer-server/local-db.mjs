import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

/** D1-shaped adapter keeps hosted SQL covered by local preview tests. */
export function createLocalDatabase(filename=':memory:'){
  const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys = ON');
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gym_rooms'").get())
    db.exec(readFileSync(new URL('../migrations/0001_multiplayer.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_accounts.sql',import.meta.url),'utf8'));
  if(!db.prepare('PRAGMA table_info(gym_rooms)').all().some(column=>column.name==='name'))
    db.exec(readFileSync(new URL('../migrations/0003_room_names.sql',import.meta.url),'utf8'));
  function prepare(sql){
    let values=[];
    const wrapped={
      bind(...args){values=args;return wrapped;},
      async first(column){const row=db.prepare(sql).get(...values);return column?row?.[column]??null:row??null;},
      async all(){return {success:true,results:db.prepare(sql).all(...values)};},
      async run(){const result=db.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},
      execute(){return db.prepare(sql).run(...values);}
    };return wrapped;
  }
  return {prepare,async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results.map(r=>({success:true,meta:{changes:Number(r.changes)}}));}catch(e){db.exec('ROLLBACK');throw e;}},close(){db.close();}};
}
