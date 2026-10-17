use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
#[cfg(windows)]
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tempfile::TempDir;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};

struct DaemonProcess {
    child: Child,
}

impl DaemonProcess {
    fn spawn(endpoint: &str, temp: &TempDir) -> Self {
        let agent_home = temp.path().join("agent");
        let runtime_dir = agent_home.join("runtime");
        let child = Command::new(env!("CARGO_BIN_EXE_lyrad"))
            .arg("--socket")
            .arg(endpoint)
            .env("LYRA_AGENT_HOME", &agent_home)
            .env("LYRA_AGENT_RUNTIME_DIR", &runtime_dir)
            .env("JCODE_HOME", &agent_home)
            .env("JCODE_RUNTIME_DIR", &runtime_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn lyrad");
        Self { child }
    }

    fn assert_running(&mut self) {
        assert!(self.child.try_wait().expect("try_wait").is_none());
    }

    fn kill_and_wait(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for DaemonProcess {
    fn drop(&mut self) {
        self.kill_and_wait();
    }
}

fn unique_endpoint(temp: &TempDir) -> String {
    #[cfg(unix)]
    {
        temp.path()
            .join("runtime")
            .join("lyrad.sock")
            .to_string_lossy()
            .into_owned()
    }
    #[cfg(windows)]
    {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        format!(r"\\.\pipe\lyrad-test-{}-{nanos}", std::process::id())
    }
}

#[cfg(unix)]
async fn connect(endpoint: &str) -> std::io::Result<tokio::net::UnixStream> {
    tokio::net::UnixStream::connect(endpoint).await
}

#[cfg(windows)]
async fn connect(
    endpoint: &str,
) -> std::io::Result<tokio::net::windows::named_pipe::NamedPipeClient> {
    tokio::net::windows::named_pipe::ClientOptions::new().open(endpoint)
}

async fn wait_for_connect<S, F, Fut>(mut connect_fn: F, daemon: &mut DaemonProcess) -> S
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = std::io::Result<S>>,
{
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        match connect_fn().await {
            Ok(stream) => return stream,
            Err(error) if Instant::now() < deadline => {
                if let Some(status) = daemon.child.try_wait().expect("try_wait") {
                    panic!("lyrad exited before accepting connections: {status}");
                }
                let _ = error;
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            Err(error) => panic!("timed out connecting to lyrad: {error}"),
        }
    }
}

async fn request<S>(stream: &mut S, id: &str, method: &str, payload: Value) -> Value
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let request = json!({
        "kind": "request",
        "id": id,
        "method": method,
        "payload": payload,
    });
    stream
        .write_all(format!("{request}\n").as_bytes())
        .await
        .expect("write request");
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).await.expect("read response");
    serde_json::from_str(&line).expect("response json")
}

async fn handshake<S>(stream: &mut S) -> Value
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    request(
        stream,
        "handshake-1",
        "runtime.handshake",
        json!({
            "protocolMinVersion": 2,
            "protocolMaxVersion": 3,
            "clientName": "daemon-lifecycle-test",
            "componentVersion": "0.1.0-test",
            "buildId": "daemon-lifecycle-test-build",
            "hostApiVersion": "1.0.0",
            "capabilities": ["runtime.host.requests"],
            "dataSchemas": { "lyra.desktop": 1 },
            "connectionRole": "primaryHost",
            "connectionLeaseId": "daemon-lifecycle-test-lease"
        }),
    )
    .await
}

#[tokio::test]
async fn daemon_accepts_handshake_and_reconnects_after_disconnect() {
    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let mut daemon = DaemonProcess::spawn(&endpoint, &temp);
    let mut first = wait_for_connect(|| connect(&endpoint), &mut daemon).await;
    let first_response = handshake(&mut first).await;
    assert_eq!(first_response["kind"], "response");
    assert_eq!(first_response["ok"], true);
    assert_eq!(first_response["result"]["protocolMinVersion"], 2);
    assert_eq!(first_response["result"]["protocolMaxVersion"], 2);
    assert_eq!(first_response["result"]["negotiatedProtocolVersion"], 2);
    assert_eq!(first_response["result"]["serverName"], "lyrad");
    let expected_component_version =
        option_env!("LYRA_COMPONENT_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"));
    assert_eq!(
        first_response["result"]["componentVersion"],
        expected_component_version
    );
    assert!(semver::Version::parse(expected_component_version).is_ok());
    assert!(first_response["result"]["buildId"].is_string());
    assert_eq!(first_response["result"]["hostApiVersion"], "1.0.0");
    assert_eq!(
        first_response["result"]["capabilities"],
        json!(["agent.import.v2", "lsp.upsert", "files.read_home"])
    );
    assert_eq!(
        first_response["result"]["dataSchemas"],
        json!({ "lyra.runtime": 1 })
    );
    assert_eq!(first_response["result"]["connectionRole"], "primaryHost");
    assert_eq!(
        first_response["result"]["connectionLeaseId"],
        "daemon-lifecycle-test-lease"
    );

    drop(first);
    let mut second = wait_for_connect(|| connect(&endpoint), &mut daemon).await;
    let second_response = handshake(&mut second).await;
    assert_eq!(second_response["ok"], true);
    daemon.assert_running();
}

#[tokio::test]
async fn daemon_reports_non_overlapping_handshake_protocol_range() {
    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let mut daemon = DaemonProcess::spawn(&endpoint, &temp);
    let mut stream = wait_for_connect(|| connect(&endpoint), &mut daemon).await;

    let response = request(
        &mut stream,
        "bad-handshake",
        "runtime.handshake",
        json!({
            "protocolMinVersion": 3,
            "protocolMaxVersion": 4,
            "clientName": "bad-client",
            "componentVersion": "0.1.0-test",
            "buildId": "bad-client-build",
            "hostApiVersion": "1.0.0",
            "capabilities": [],
            "dataSchemas": {},
            "connectionRole": "auxiliaryClient",
            "connectionLeaseId": "bad-client-lease"
        }),
    )
    .await;

    assert_eq!(response["kind"], "response");
    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["code"], "PROTOCOL_VERSION_MISMATCH");
    assert_eq!(
        response["error"]["details"]["client"],
        json!({ "min": 3, "max": 4 })
    );
    assert_eq!(
        response["error"]["details"]["server"],
        json!({ "min": 2, "max": 2 })
    );
    daemon.assert_running();
}

#[tokio::test]
async fn daemon_rejects_a_different_host_api_major() {
    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let mut daemon = DaemonProcess::spawn(&endpoint, &temp);
    let mut stream = wait_for_connect(|| connect(&endpoint), &mut daemon).await;

    let response = request(
        &mut stream,
        "bad-host-api",
        "runtime.handshake",
        json!({
            "protocolMinVersion": 2,
            "protocolMaxVersion": 2,
            "clientName": "future-core",
            "componentVersion": "2.0.0",
            "buildId": "future-core-build",
            "hostApiVersion": "2.0.0",
            "capabilities": ["runtime.host.requests"],
            "dataSchemas": { "lyra.desktop": 1 },
            "connectionRole": "primaryHost",
            "connectionLeaseId": "future-core-lease"
        }),
    )
    .await;

    assert_eq!(response["kind"], "response");
    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["code"], "HOST_API_VERSION_MISMATCH");
    assert_eq!(response["error"]["details"]["client"], "2.0.0");
    assert_eq!(response["error"]["details"]["runtime"], "1.0.0");
    daemon.assert_running();
}

#[tokio::test]
async fn daemon_rejects_legacy_v1_handshake_shape() {
    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let mut daemon = DaemonProcess::spawn(&endpoint, &temp);
    let mut stream = wait_for_connect(|| connect(&endpoint), &mut daemon).await;

    let response = request(
        &mut stream,
        "legacy-handshake",
        "runtime.handshake",
        json!({ "protocolVersion": 1, "clientName": "legacy-client" }),
    )
    .await;

    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["code"], "BAD_REQUEST");
    daemon.assert_running();
}

#[tokio::test]
async fn daemon_second_instance_exits_without_stealing_endpoint() {
    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let mut first = DaemonProcess::spawn(&endpoint, &temp);
    let mut stream = wait_for_connect(|| connect(&endpoint), &mut first).await;
    assert_eq!(handshake(&mut stream).await["ok"], true);

    let mut second = DaemonProcess::spawn(&endpoint, &temp);
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if second.child.try_wait().expect("try_wait").is_some() {
            break;
        }
        assert!(Instant::now() < deadline, "second daemon did not exit");
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    first.assert_running();
    drop(stream);
    let mut stream = wait_for_connect(|| connect(&endpoint), &mut first).await;
    assert_eq!(handshake(&mut stream).await["ok"], true);
}

#[tokio::test]
async fn daemon_recovers_from_stale_socket_after_crash() {
    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let mut first = DaemonProcess::spawn(&endpoint, &temp);
    let mut stream = wait_for_connect(|| connect(&endpoint), &mut first).await;
    assert_eq!(handshake(&mut stream).await["ok"], true);
    drop(stream);
    first.kill_and_wait();

    let mut second = DaemonProcess::spawn(&endpoint, &temp);
    let mut stream = wait_for_connect(|| connect(&endpoint), &mut second).await;
    assert_eq!(handshake(&mut stream).await["ok"], true);
}

#[cfg(unix)]
#[tokio::test]
async fn daemon_unix_socket_is_private() {
    use std::os::unix::fs::PermissionsExt;

    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let mut daemon = DaemonProcess::spawn(&endpoint, &temp);
    let _stream = wait_for_connect(|| connect(&endpoint), &mut daemon).await;
    let mode = std::fs::metadata(&endpoint)
        .expect("socket metadata")
        .permissions()
        .mode()
        & 0o777;

    assert_eq!(mode, 0o600);
}

#[cfg(unix)]
#[tokio::test]
async fn daemon_dies_with_its_parent_without_explicit_kill() {
    // The desktop's freeze/force-kill must not orphan lyrad together with every
    // PTY session it hosts — the zombie http.server that held a port across
    // app restarts was a lyrad outliving Electron. lyrad arms
    // PR_SET_PDEATHSIG(SIGTERM) at startup, so a parent that exits without
    // sending any signal must take the daemon down with it.

    let temp = TempDir::new().expect("tempdir");
    let endpoint = unique_endpoint(&temp);
    let agent_home = temp.path().join("agent");
    let runtime_dir = agent_home.join("runtime");
    let pid_file = temp.path().join("lyrad.pid");

    let launcher = Command::new("/bin/sh")
        .arg("-c")
        .arg(format!(
            "{bin} --socket {endpoint} >/dev/null 2>&1 & PID=$!; echo $PID > {pid_file}; sleep 3",
            bin = env!("CARGO_BIN_EXE_lyrad"),
            endpoint = endpoint,
            pid_file = pid_file.display()
        ))
        .env("LYRA_AGENT_HOME", &agent_home)
        .env("LYRA_AGENT_RUNTIME_DIR", &runtime_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("launch intermediate parent");
    assert!(launcher.success(), "intermediate parent exited abnormally");

    let pid = std::fs::read_to_string(&pid_file)
        .expect("lyrad pid file")
        .trim()
        .parse::<i32>()
        .expect("pid");

    // The intermediate shell stays alive for 3s so the daemon finishes arming
    // PR_SET_PDEATHSIG (a debug-build lyrad takes longer to start than the
    // shell takes to exit — arming after the parent died would silently bind
    // to the subreaper instead), then exits. PDEATHSIG fires within moments:
    // the daemon must die on its own, with no kill signal from this test
    // process.
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let alive = std::fs::metadata(format!("/proc/{pid}")).is_ok();
        if !alive {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "lyrad (pid {pid}) survived its parent's exit; PDEATHSIG did not fire"
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}
