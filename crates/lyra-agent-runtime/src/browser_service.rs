#[derive(Clone, Debug, Default)]
pub struct BrowserService;

impl BrowserService {
    pub const NAME: &'static str = "browser_service";

    pub fn list_host_capabilities(&self) -> serde_json::Value {
        serde_json::json!({
            "operators": [
                {
                    "id": "lyra-lumen",
                    "visibleFollow": true,
                    "implicit": true,
                    "feedback": ["cursor", "focus", "hover", "click", "input", "wait"],
                    "selectors": ["selectorMap", "focusScan", "weakDom"],
                    "wait": ["wait", "readUntil"],
                    "visualFallback": true
                }
            ],
            "sessionPreservation": {
                "schemaVersion": 1,
                "snapshot": "BrowserSessionSnapshot",
                "storageState": "BrowserStorageStateRef",
                "recoveryAnchor": "BrowserRecoveryAnchor",
                "hostCapability": "workbench.browser.readSessionSnapshot",
                "profilePartitions": {
                    "live": "persist:lyra-browser-live",
                    "isolated": "persist:lyra-browser-isolated",
                    "relationship": "shared-live-tabs-isolated-agent"
                },
                "chromiumStorage": {
                    "persistence": "chromium-profile",
                    "manifestOnly": true,
                    "sensitiveValues": "metadata_only"
                },
                "recoveryFailureReasons": [
                    "profile_missing",
                    "storage_unavailable",
                    "navigation_failed",
                    "target_stale",
                    "renderer_crashed"
                ]
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::BrowserService;

    #[test]
    fn browser_capabilities_cover_follow_and_implicit_modes() {
        let capabilities = BrowserService::default().list_host_capabilities();
        let operator = &capabilities["operators"][0];
        assert_eq!(operator["visibleFollow"], true);
        assert_eq!(operator["implicit"], true);
        assert!(
            operator["wait"]
                .as_array()
                .expect("wait modes")
                .contains(&"readUntil".into())
        );
        assert_eq!(
            capabilities["sessionPreservation"]["hostCapability"],
            "workbench.browser.readSessionSnapshot"
        );
        assert_eq!(
            capabilities["sessionPreservation"]["chromiumStorage"]["sensitiveValues"],
            "metadata_only"
        );
    }
}
