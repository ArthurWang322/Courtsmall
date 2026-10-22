// Notices on macOS, through UNUserNotificationCenter (src/notify/notifier.ts). The notification plugin
// (2.6, 2.7) sends through NSUserNotificationCenter, deprecated since macOS 11, which macOS 26 drops
// while reporting success: no notice ever showed (2026-10-22). This asks once whether Courtsmall may
// notify, then posts. It needs an app bundle: under `npm run tauri dev` there is none, and it says so.
// An ad-hoc signed app may notify once it runs from an Applications folder (checked 2026-10-22).

use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_foundation::{NSBundle, NSError, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotificationRequest, UNNotificationSound,
    UNUserNotificationCenter,
};
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// What an error the system hands back says, or `fallback`.
fn said(err: *mut NSError, fallback: &str) -> String {
    unsafe { err.as_ref() }.map_or_else(|| fallback.to_string(), |e| e.localizedDescription().to_string())
}

/// Posts a notice now. Blocks until macOS has answered: the first time, until the person has said
/// whether Courtsmall may notify.
pub fn send(title: &str, body: &str) -> Result<(), String> {
    if NSBundle::mainBundle().bundleIdentifier().is_none() {
        return Err("not an app bundle (npm run tauri dev): macOS shows no notices".into());
    }
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (tx, rx) = mpsc::channel::<Result<(), String>>();

    // Asked once; after that macOS answers at once with what the person chose.
    let t = tx.clone();
    let asked = RcBlock::new(move |granted: Bool, err: *mut NSError| {
        let _ = t.send(if granted.as_bool() { Ok(()) } else { Err(said(err, "notices are switched off for Courtsmall")) });
    });
    center.requestAuthorizationWithOptions_completionHandler(UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound, &asked);
    rx.recv_timeout(Duration::from_secs(120)).map_err(|_| "no answer to the question whether Courtsmall may notify".to_string())??;

    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(title));
    content.setBody(&NSString::from_str(body));
    content.setSound(Some(&UNNotificationSound::defaultSound()));
    // Each its own: one with the same identifier would replace the last.
    let id = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(&NSString::from_str(&format!("courtsmall-{id}")), &content, None);
    let added = RcBlock::new(move |err: *mut NSError| {
        let _ = tx.send(if err.is_null() { Ok(()) } else { Err(said(err, "the notice was not posted")) });
    });
    center.addNotificationRequest_withCompletionHandler(&request, Some(&added));
    rx.recv_timeout(Duration::from_secs(10)).map_err(|_| "no answer from macOS to the notice".to_string())?
}
