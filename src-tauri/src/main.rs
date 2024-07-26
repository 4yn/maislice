// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
// #[tauri::command]
// fn greet(name: &str) -> String {
//     format!("Hello, {}! You've been greeted from Rust!", name)
// }

fn main() {
    tauri::Builder::default()
        // .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            tauri::WindowBuilder::new(app, "main", tauri::WindowUrl::App("index.html".into()))
                .title("maislice")
                .on_web_resource_request(|_req, resp| {
                    resp.headers_mut().insert(
                        "Cross-Origin-Opener-Policy",
                        "same-origin".try_into().unwrap(),
                    );
                    resp.headers_mut().insert(
                        "Cross-Origin-Embedder-Policy",
                        "require-corp".try_into().unwrap(),
                    );
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
