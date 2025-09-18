export const LOCALE = (navigator.language||'en').slice(0,2);
export const STR = {
  en: { idle:'Idle', running:'Running', paused:'Paused', done:'Done' },
  tr: { idle:'Beklemede', running:'Çalışıyor', paused:'Duraklatıldı', done:'Bitti' }
}[LOCALE] || { idle:'Idle', running:'Running', paused:'Paused', done:'Done' };
