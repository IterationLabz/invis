'use strict';
function normalizeTransparency(value) {
  return typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(0,Math.min(100,value))):20;
}
function createVisibility({window,companion=null,settings,persist,onChange=()=>{}}) {
  settings.transparency=normalizeTransparency(settings.transparency);
  const windows=[window,companion].filter(Boolean);
  const apply=()=>windows.forEach(w=>{if(!w.isDestroyed())w.setOpacity(1-settings.transparency/100);});
  const hide=()=>windows.forEach(w=>{if(!w.isDestroyed())w.hide();});
  const recover=()=>{if(settings.transparency>=95){settings.transparency=20;apply();persist();onChange(settings.transparency);}};
  apply();
  return {
    set(value) {
      if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new Error('Transparency must be between 0 and 100.');
      settings.transparency=Math.round(value);apply();persist();onChange(settings.transparency);return settings.transparency;
    },
    hide,
    workspace(){if(window.isDestroyed())return;recover();window.show();window.focus();},
    compact(){if(window.isDestroyed())return;window.hide();if(companion&&!companion.isDestroyed()){recover();companion.show();}},
    toggle(){
      if(window.isDestroyed())return;
      if(windows.some(w=>!w.isDestroyed()&&w.isVisible())&&settings.transparency<95){hide();return;}
      // Command+B must always recover a window made effectively invisible.
      recover();
      if(companion&&!companion.isDestroyed()){window.hide();companion.show();companion.focus();}
      else{window.show();window.focus();}
    }
  };
}
module.exports={createVisibility,normalizeTransparency};
