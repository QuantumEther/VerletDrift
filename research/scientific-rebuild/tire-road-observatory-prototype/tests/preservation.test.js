import test from 'node:test';import assert from 'node:assert/strict';import{execFileSync}from 'node:child_process';import{readFileSync}from 'node:fs';
test('all six predecessor exhibits remain frozen',()=>{for(const name of ['javascript-driving-prototype','four-wheel-driving-prototype','differential-driving-prototype','clutch-driving-prototype','drivetrain-visualization-prototype','manual-gearbox-prototype'])for(const f of execFileSync('git',['ls-tree','-r','--name-only','c4ef0d8','--','research/scientific-rebuild/'+name],{encoding:'utf8'}).trim().split('\n'))assert.deepEqual(readFileSync(f),execFileSync('git',['show','c4ef0d8:'+f],{maxBuffer:8*1024*1024}),f);});

test("immediate Mission 38 predecessor remains byte-for-byte frozen",()=>{const root="research/scientific-rebuild/unsynchronized-gearbox-prototype";for(const f of execFileSync("git",["ls-tree","-r","--name-only","012423a","--",root],{encoding:"utf8"}).trim().split("\n"))assert.deepEqual(readFileSync(f),execFileSync("git",["show","012423a:"+f],{maxBuffer:8*1024*1024}),f);});

test('previous braking-stage results and archived README preserve their committed evidence',()=>{
 const root='research/scientific-rebuild/braking-and-tire-contact-prototype';
 for(const f of execFileSync('git',['ls-tree','-r','--name-only','7fca4a4','--',root+'/results'],{encoding:'utf8'}).trim().split('\n'))assert.deepEqual(readFileSync(f),execFileSync('git',['show','7fca4a4:'+f],{maxBuffer:8*1024*1024}),f);
 assert.deepEqual(readFileSync(root+'/BRAKING-BASELINE-README.md'),execFileSync('git',['show','7fca4a4:'+root+'/README.md']));
});
