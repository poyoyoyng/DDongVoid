using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using DDongVoid.Core;
using Microsoft.Win32;

namespace DDongVoid;

public partial class MainWindow : Window
{
    private const string DefaultDataFolder = @"\\192.168.0.120\SW Team\팀원\최지운\DD";
    private enum PlayState { Home, Playing, Paused, Over }
    private sealed class Preferences
    {
        public string? DataFolder { get; set; }
        public bool Transparent { get; set; } = true;
        public double BackgroundStrength { get; set; } = 1;
        public bool AlwaysOnTop { get; set; }
        public double PlayerAlpha { get; set; } = .8;
        public double HazardAlpha { get; set; } = .65;
        public bool ShowQuietScore { get; set; }
        public double ScoreAlpha { get; set; } = .25;
        public double? WindowWidth { get; set; }
        public double? WindowHeight { get; set; }
        public string? RememberedUser { get; set; }
        public string? RememberedFolder { get; set; }
        public string? RememberedKey { get; set; }
    }
    private readonly string preferencesPath;
    private Preferences preferences;
    private LocalStore store;
    private string? userId;
    private PlayState playState;
    private string panel = "home";
    private TextBlock? message;
    private PlayRecord? pendingRecord;
    private readonly Stopwatch frameClock = Stopwatch.StartNew();
    private double lastFrame;
    private int bestScore;
    private bool busy;
    private bool hotkeyRegistered;
    private bool lastRecordSaved;
    private HwndSource? source;
    private string? startupError;
    private int rankingRequest;
    private readonly UpdateService updateService = new();
    private readonly CancellationTokenSource updateLifetime = new();
    private readonly DispatcherTimer updateTimer = new() { Interval = TimeSpan.FromMinutes(15) };
    private readonly HashSet<string> offeredUpdates = [];
    private AvailableUpdate? availableUpdate;
    private bool checkingUpdate;
    private bool offeringUpdate;
    private bool installingUpdate;
    private bool resumingSession;
    private Rect? sizeModeRestore;
    private const double SizeModeGrip = 24;

    public MainWindow()
    {
        InitializeComponent();
        var portable = Environment.GetCommandLineArgs().Contains("--portable");
        var localFolder = portable ? AppContext.BaseDirectory : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DDongVoid");
        preferencesPath = Path.Combine(localFolder, "settings.json");
        preferences = LoadPreferences();
        // Resolve the path without network I/O so an offline share cannot delay the game window.
        try { store = new LocalStore(string.IsNullOrWhiteSpace(preferences.DataFolder) ? DefaultDataFolder : preferences.DataFolder); }
        catch (Exception ex) when (IsUserError(ex))
        {
            store = new LocalStore(DefaultDataFolder);
            startupError = "저장 폴더를 확인해 주세요. " + ex.Message;
        }
        ApplyAppearance();
        if (preferences.WindowWidth is double savedWidth && preferences.WindowHeight is double savedHeight)
        {
            Width = Math.Min(savedWidth, SystemParameters.WorkArea.Width);
            Height = Math.Min(savedHeight, SystemParameters.WorkArea.Height);
        }
        SizeChanged += (_, _) => { if (sizeModeRestore is not null) UpdateSizeModeText(); };
        SourceInitialized += (_, _) =>
        {
            source = HwndSource.FromHwnd(new WindowInteropHelper(this).Handle);
            source.AddHook(WindowProc);
            hotkeyRegistered = RegisterHotKey(source.Handle, 1, 0x4006, 0x20);
        };
        Loaded += async (_, _) => { ShowHome(); updateTimer.Start(); _ = ResumeSessionAsync(); await CheckUpdatesAsync(false); };
        updateTimer.Tick += async (_, _) => await CheckUpdatesAsync(false);
        Activated += (_, _) => Dispatcher.BeginInvoke((Action)(() => OfferUpdate(false)));
        CompositionTarget.Rendering += RenderFrame;
        Closing += OnClosing;
        Closed += (_, _) =>
        {
            CompositionTarget.Rendering -= RenderFrame;
            updateTimer.Stop(); updateLifetime.Cancel();
            if (source is not null) { if (hotkeyRegistered) UnregisterHotKey(source.Handle, 1); source.RemoveHook(WindowProc); }
        };
    }
    private static bool IsUserError(Exception ex) => ex is IOException or InvalidDataException or UnauthorizedAccessException or ArgumentException or NotSupportedException or System.Security.SecurityException or System.Threading.WaitHandleCannotBeOpenedException;
    private Preferences LoadPreferences()
    {
        try
        {
            if (!File.Exists(preferencesPath)) return new();
            var p = JsonSerializer.Deserialize<Preferences>(File.ReadAllText(preferencesPath)) ?? new();
            p.BackgroundStrength = double.IsFinite(p.BackgroundStrength) ? Math.Clamp(p.BackgroundStrength, 0, 1) : 1;
            p.PlayerAlpha = double.IsFinite(p.PlayerAlpha) ? Math.Clamp(p.PlayerAlpha, 0, 1) : .8;
            p.HazardAlpha = double.IsFinite(p.HazardAlpha) ? Math.Clamp(p.HazardAlpha, 0, 1) : .65;
            p.ScoreAlpha = double.IsFinite(p.ScoreAlpha) ? Math.Clamp(p.ScoreAlpha, 0, 1) : .25;
            if (p.WindowWidth is not (> 0 and < 100000) || p.WindowHeight is not (> 0 and < 100000)) p.WindowWidth = p.WindowHeight = null;
            return p;
        }
        catch (Exception ex) when (IsUserError(ex) || ex is JsonException)
        { startupError = "설정을 읽지 못해 기본 설정으로 열었습니다. " + ex.Message; return new(); }
    }
    private bool SavePreferences()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(preferencesPath)!);
            var temp = preferencesPath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(preferences, new JsonSerializerOptions { WriteIndented = true }));
            File.Move(temp, preferencesPath, true); return true;
        }
        catch (Exception ex) when (IsUserError(ex)) { SetMessage("설정을 저장하지 못했습니다. " + ex.Message); return false; }
    }
    private void ApplyAppearance()
    {
        Shell.Background = Brushes.Transparent;
        Surface.TransparentMode = preferences.Transparent;
        Surface.BackgroundStrength = preferences.BackgroundStrength;
        Surface.PlayerAlpha = preferences.PlayerAlpha;
        Surface.HazardAlpha = preferences.HazardAlpha;
        ModeLabel.Visibility = preferences.Transparent ? Visibility.Hidden : Visibility.Visible;
        var chrome = preferences.Transparent ? Visibility.Collapsed : Visibility.Visible;
        TitleChrome.Visibility = HudChrome.Visibility = FooterChrome.Visibility = chrome;
        TitleRow.Height = new GridLength(preferences.Transparent ? 0 : 56);
        HudRow.Height = new GridLength(preferences.Transparent ? 0 : 88);
        FooterRow.Height = new GridLength(preferences.Transparent ? 0 : 56);
        Shell.BorderBrush = preferences.Transparent ? Brushes.Transparent : new SolidColorBrush(Color.FromRgb(59, 80, 68));
        ResizeMarker.Visibility = chrome;
        Overlay.Background = preferences.Transparent ? Brushes.Transparent : new SolidColorBrush(Color.FromArgb(48, 16, 27, 23));
        QuietScore.Visibility = preferences.Transparent && preferences.ShowQuietScore ? Visibility.Visible : Visibility.Collapsed;
        QuietScore.Opacity = preferences.ScoreAlpha;
        MinWidth = preferences.Transparent ? 300 : 480;
        MinHeight = preferences.Transparent ? 320 : 600;
        Topmost = preferences.AlwaysOnTop;
        Surface.InvalidateVisual();
    }
    private void RenderFrame(object? sender, EventArgs e)
    {
        var now = frameClock.Elapsed.TotalSeconds;
        var dt = now - lastFrame; lastFrame = now;
        if (playState != PlayState.Playing) return;
        var direction = (Keyboard.IsKeyDown(Key.Right) || Keyboard.IsKeyDown(Key.D) ? 1 : 0) -
                        (Keyboard.IsKeyDown(Key.Left) || Keyboard.IsKeyDown(Key.A) ? 1 : 0);
        Surface.Engine.Update(dt, direction);
        Surface.InvalidateVisual();
        UpdateHud();
        if (Surface.Engine.IsOver) FinishGame();
    }
    private void UpdateHud()
    {
        ScoreText.Text = Surface.Engine.Score.ToString("D5");
        QuietScore.Text = Surface.Engine.Score.ToString("D5");
        var time = TimeSpan.FromSeconds(Surface.Engine.Seconds);
        TimeText.Text = $"{(int)time.TotalMinutes:00}:{time.Seconds:00}  ·  LV. {Surface.Engine.Level}";
        BestText.Text = bestScore == 0 ? "BEST  —" : $"BEST  {bestScore:N0}";
        UserText.Text = userId is not null ? $"● {userId}" : resumingSession ? "로그인 확인 중…" : "로그인이 필요합니다";
        AccountButton.Content = userId is null ? "로그인" : "계정";
        PauseButton.IsEnabled = playState is PlayState.Playing or PlayState.Paused;
        PauseButton.Content = playState == PlayState.Paused ? "계속하기" : "일시정지";
    }
    private void BeginPanel(string name, string eyebrow, string title, string description)
    {
        panel = name; Overlay.Visibility = Visibility.Visible; DialogContent.Children.Clear(); message = null;
        AddText(eyebrow, 10, "#A7F3CE", 0, 0, true);
        AddText(title, 27, "#EDF4F0", 9, 10, true);
        if (!string.IsNullOrWhiteSpace(description)) AddText(description, 12, "#A8BCAF", 0, 17);
        Dispatcher.BeginInvoke((Action)(() => OfferUpdate(false)));
    }
    private TextBlock AddText(string text, double size = 13, string color = "#EDF4F0", double top = 0, double bottom = 10, bool bold = false)
    {
        var label = new TextBlock { Text = text, FontSize = size, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color)),
            TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, top, 0, bottom), FontWeight = bold ? FontWeights.Bold : FontWeights.Normal };
        DialogContent.Children.Add(label); return label;
    }
    private Button AddButton(string text, Action action, bool primary = false)
    {
        var button = new Button { Content = text, Margin = new Thickness(0, 5, 0, 3), HorizontalAlignment = HorizontalAlignment.Stretch };
        if (primary) button.Style = (Style)FindResource("Primary");
        button.Click += (_, _) => { if (!busy) action(); };
        DialogContent.Children.Add(button); return button;
    }
    private void SetMessage(string text, bool success = false)
    {
        if (message is null) message = AddText("", 12, "#F4B69D", 12, 0);
        message.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(success ? "#A7F3CE" : "#F4B69D"));
        message.Text = text;
    }
    private void ShowHome()
    {
        BeginPanel("home", "A LITTLE DESKTOP ESCAPE", "AKC미니게임", "잠깐 쉬어 갈 작은 게임 모음입니다.\n게임 시작을 누르고 목록에서 하나를 고르세요.");
        AddText("SPACE     게임 선택 · 일시정지\nF2            설정 열기 · 닫기\nCtrl + Shift + Space     숨기기 · 복귀", 12, "#91AB9C", 2, 18);
        if (userId is not null) AddButton("게임 시작  →", ShowGameList, true);
        else if (resumingSession) AddButton("로그인 확인 중…", () => { }, true).IsEnabled = false;
        else AddButton("로그인하고 시작  →", () => ShowAuth(false), true);
        AddButton("랭킹 보기", ShowRankings);
        AddButton("설정  /  F2", ShowSettings);
        if (userId is not null) AddButton($"로그아웃  ·  {userId}", Logout);
        else if (!resumingSession) AddButton("로그인 / 회원가입", () => ShowAuth(false));
        if (startupError is not null) SetMessage(startupError);
        if (!hotkeyRegistered) SetMessage("숨기기 단축키를 등록하지 못했습니다. 숨기기 버튼은 최소화로 작동합니다.");
        UpdateHud();
    }
    private bool RequireLogin()
    {
        if (userId is not null) return true;
        if (resumingSession) SetMessage("로그인을 확인하고 있습니다. 잠시만 기다려 주세요.");
        else if (HasRememberedSession) _ = ResumeSessionAsync();
        else { ShowAuth(false); SetMessage("게임을 시작하려면 먼저 로그인해 주세요."); }
        return false;
    }
    private void ShowGameList()
    {
        if (pendingRecord is not null) { ShowEnd(); return; }
        if (!RequireLogin()) return;
        BeginPanel("games", "AKC MINI GAMES", "어떤 게임을 할까요?", "목록에서 플레이할 게임을 고르세요.");
        AddGameItem("똥 피하기", "하늘에서 떨어지는 똥을 피하세요. 시간이 지날수록 더 빠르게, 더 많이 떨어집니다.", "←  →  /  A  D 이동   ·   10점 / 생존 1초 + 25점 / 피한 똥", StartGame);
        AddButton("돌아가기", ShowHome);
    }
    private void AddGameItem(string title, string description, string detail, Action start)
    {
        var body = new StackPanel();
        body.Children.Add(new TextBlock { Text = title, FontSize = 16, FontWeight = FontWeights.Bold });
        body.Children.Add(new TextBlock { Text = description, FontSize = 12, Foreground = new SolidColorBrush(Color.FromRgb(168, 188, 175)), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
        body.Children.Add(new TextBlock { Text = detail, FontSize = 10, Foreground = new SolidColorBrush(Color.FromRgb(114, 143, 125)), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) });
        var button = new Button { Content = body, HorizontalContentAlignment = HorizontalAlignment.Left, Padding = new Thickness(16, 14, 16, 14), Margin = new Thickness(0, 0, 0, 8) };
        System.Windows.Automation.AutomationProperties.SetName(button, title);
        button.Click += (_, _) => { if (!busy) start(); };
        DialogContent.Children.Add(button);
    }
    private void StartGame()
    {
        if (pendingRecord is not null) { ShowEnd(); return; }
        if (!RequireLogin()) return;
        Surface.Engine.Reset(); Surface.Demo = false; playState = PlayState.Playing;
        lastRecordSaved = false;
        Overlay.Visibility = Visibility.Collapsed; lastFrame = frameClock.Elapsed.TotalSeconds;
        UpdateHud(); Surface.Focus(); Surface.InvalidateVisual();
    }
    private void PauseGame()
    {
        if (playState != PlayState.Playing) return;
        playState = PlayState.Paused; UpdateHud(); ShowPause();
    }
    private void ShowPause()
    {
        BeginPanel("pause", "TAKE A BREATHER", "잠깐, 쉬어가기.", "게임이 멈춰 있습니다. 준비되면 이어서 플레이하세요.");
        AddText($"생존 {Surface.Engine.Seconds:F1}초    ·    난이도 LV. {Surface.Engine.Level}", 12, "#A7F3CE", 0, 12);
        AddButton("계속하기  →", ResumeGame, true);
        AddButton("처음부터 다시", StartGame);
        AddButton("그만하기 · 메인 메뉴로", QuitToMainMenu);
        AddText("창 밖을 클릭하거나 창을 숨기면 자동으로 일시정지합니다.\n그만한 판의 점수는 기록에 저장하지 않습니다.", 11, "#91AB9C", 14, 0);
    }
    private void QuitToMainMenu()
    {
        if (pendingRecord is not null) { ShowEnd(); return; }
        playState = PlayState.Home;
        Surface.Engine.Reset(); Surface.Demo = true; lastRecordSaved = false;
        lastFrame = frameClock.Elapsed.TotalSeconds;
        Surface.InvalidateVisual(); ShowHome();
    }
    private void ResumeGame()
    {
        if (playState != PlayState.Paused) return;
        playState = PlayState.Playing; Overlay.Visibility = Visibility.Collapsed;
        lastFrame = frameClock.Elapsed.TotalSeconds; UpdateHud(); Surface.Focus();
    }
    private void ReturnToGame()
    {
        if (playState == PlayState.Paused) ShowPause();
        else if (playState == PlayState.Over) ShowEnd();
        else ShowHome();
    }
    private void FinishGame()
    {
        playState = PlayState.Over;
        bestScore = Math.Max(bestScore, Surface.Engine.Score);
        if (userId is not null)
            pendingRecord = new PlayRecord(Guid.NewGuid(), userId, Surface.Engine.Score, Surface.Engine.Seconds, Surface.Engine.Dodged, DateTimeOffset.UtcNow);
        ShowEnd();
        SavePendingRecord(); UpdateHud();
    }
    private void SavePendingRecord()
    {
        if (pendingRecord is null) return;
        try
        {
            store.AddRecord(pendingRecord); pendingRecord = null; lastRecordSaved = true;
            if (panel == "end") ShowEnd();
        }
        catch (Exception ex) when (IsUserError(ex)) { SetMessage("기록 저장 실패: " + ex.Message + "\n아래 버튼으로 다시 저장할 수 있습니다."); }
    }
    private void ShowEnd()
    {
        BeginPanel("end", "NICE TRY. ONE MORE?", "앗, 맞아버렸다!", "다음에는 조금 더 오래 버틸 수 있을 거예요.");
        AddText($"{Surface.Engine.Score:N0} 점", 38, "#A7F3CE", 0, 8, true);
        AddText($"생존 {Surface.Engine.Seconds:F1}초    ·    피한 똥 {Surface.Engine.Dodged}개", 13, "#B6C7BC", 0, 16);
        if (pendingRecord is null)
        {
            AddButton("한 판 더  →", StartGame, true);
            AddButton("내 기록 보기", ShowHistory);
            AddButton("메인 화면으로", QuitToMainMenu);
            AddText(lastRecordSaved ? "✓ 내 기록에 저장했습니다." : "이번 기록은 저장하지 않았습니다.", 11, "#91AB9C", 12, 0);
        }
        else
        {
            AddButton("기록 저장 재시도", SavePendingRecord, true);
            AddButton("저장하지 않고 계속", () =>
            {
                if (MessageBox.Show(this, "이번 기록을 저장하지 않고 계속할까요?", "미저장 기록", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
                { pendingRecord = null; ShowEnd(); SetMessage("이번 기록은 저장하지 않았습니다."); }
            });
        }
    }
    private void ShowAuth(bool register)
    {
        if (pendingRecord is not null) { ShowEnd(); return; }
        BeginPanel("auth", "YOUR OWN LITTLE RECORD", register ? "반가워요, 새 플레이어." : "다시 오셨네요.", "");
        AddText("아이디", 12, "#B6C7BC", 0, 6);
        var idInput = new TextBox { MaxLength = 24, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(idInput, "아이디"); DialogContent.Children.Add(idInput);
        AddText("비밀번호", 12, "#B6C7BC", 0, 6);
        var password = new PasswordBox { MaxLength = 128, Margin = new Thickness(0, 0, 0, 12) };
        System.Windows.Automation.AutomationProperties.SetName(password, "비밀번호"); DialogContent.Children.Add(password);
        PasswordBox? confirm = null;
        if (register)
        {
            AddText("비밀번호 확인", 12, "#B6C7BC", 0, 6);
            confirm = new PasswordBox { MaxLength = 128, Margin = new Thickness(0, 0, 0, 12) };
            System.Windows.Automation.AutomationProperties.SetName(confirm, "비밀번호 확인"); DialogContent.Children.Add(confirm);
            AddText("아이디 3~24자", 11, "#91AB9C", 0, 8);
        }
        var submit = AddButton(register ? "회원가입하고 시작하기" : "로그인", () => { }, true);
        submit.Click += async (_, _) =>
        {
            if (busy) return;
            if (register && password.Password != confirm!.Password) { SetMessage("비밀번호 확인이 일치하지 않습니다."); return; }
            var id = idInput.Text; var secret = password.Password;
            busy = true; submit.IsEnabled = false; idInput.IsEnabled = false; password.IsEnabled = false;
            if (confirm is not null) confirm.IsEnabled = false;
            try
            {
                var loggedIn = await Task.Run(() => register ? store.Register(id, secret) : store.Login(id, secret));
                var personalBest = await Task.Run(() => store.BestScore(loggedIn));
                var sessionKey = await Task.Run(() => store.SessionKey(loggedIn));
                userId = loggedIn; bestScore = personalBest;
                password.Clear(); confirm?.Clear();
                playState = PlayState.Home; Surface.Engine.Reset(); Surface.Demo = true; Surface.InvalidateVisual();
                startupError = null; ShowHome(); SetMessage(register ? "회원가입이 완료되었습니다." : "로그인했습니다.", true);
                preferences.RememberedUser = loggedIn; preferences.RememberedFolder = store.Folder; preferences.RememberedKey = sessionKey;
                SavePreferences();
            }
            catch (Exception ex) when (IsUserError(ex)) { SetMessage(ex.Message); }
            finally
            {
                busy = false; submit.IsEnabled = true; idInput.IsEnabled = true; password.IsEnabled = true;
                if (confirm is not null) confirm.IsEnabled = true;
            }
        };
        AddButton(register ? "이미 계정이 있어요 · 로그인" : "처음이에요 · 회원가입", () => ShowAuth(!register));
        AddButton("저장 폴더 설정", ShowSettings);
        AddButton("돌아가기", ReturnToGame);
        idInput.Focus();
    }
    private void ShowAccount()
    {
        if (userId is null) { ShowAuth(false); return; }
        BeginPanel("account", "PLAYER ACCOUNT", userId, "");
        AddButton("내 기록 보기", ShowHistory, true);
        AddButton("로그아웃", Logout);
        AddButton("돌아가기", ReturnToGame);
    }
    private void Logout()
    {
        if (pendingRecord is not null) { ShowEnd(); return; }
        ForgetSession(); userId = null; bestScore = 0; playState = PlayState.Home; Surface.Engine.Reset(); Surface.Demo = true; Surface.InvalidateVisual(); ShowHome();
        SetMessage("로그아웃했습니다.", true);
    }
    private async void ShowRankings()
    {
        var request = ++rankingRequest;
        var rankingStore = store;
        BeginPanel("ranking", "HALL OF FAME", "최고의 회피왕은?", "아이디별 최고 점수 순위 · 같은 점수는 공동 순위");
        AddText("랭킹을 불러오는 중입니다…", 12, "#91AB9C");
        AddButton("메인 메뉴로", ReturnToGame);
        try
        {
            var rankings = await Task.Run(rankingStore.Rankings);
            if (panel != "ranking" || request != rankingRequest || store != rankingStore) return;
            BeginPanel("ranking", "HALL OF FAME", "최고의 회피왕은?", "아이디별 최고 점수 순위 · 같은 점수는 공동 순위");
            if (rankings.Count == 0) AddText("아직 등록된 점수가 없어요.\n로그인 후 첫 기록을 남겨 보세요.", 13, "#91AB9C", 0, 16);
            else
            {
                if (userId is not null)
                {
                    var mine = rankings.FirstOrDefault(r => r.UserId == userId);
                    AddText(mine is null ? "내 순위  —  아직 플레이 기록이 없어요." : $"내 순위  {mine.Rank}위    ·    최고 {mine.BestScore:N0}점", 12, "#A7F3CE", 0, 12, true);
                    if (mine is not null) { bestScore = mine.BestScore; UpdateHud(); }
                }
                AddText($"전체 {rankings.Count:N0}명", 10, "#91AB9C", 0, 8);
                var rows = new StackPanel();
                foreach (var entry in rankings)
                {
                    var mine = entry.UserId == userId;
                    var row = new Grid();
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(42) });
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                    var rank = new TextBlock { Text = $"{entry.Rank}위", FontSize = 12, Foreground = entry.Rank <= 3 ? Brushes.PaleGoldenrod : Brushes.Gray, VerticalAlignment = VerticalAlignment.Center };
                    var id = new TextBlock { Text = entry.UserId + (mine ? " (나)" : ""), FontSize = 12, Margin = new Thickness(0, 0, 10, 0), TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = entry.UserId, VerticalAlignment = VerticalAlignment.Center };
                    var score = new TextBlock { Text = $"{entry.BestScore:N0}점", FontSize = 13, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(Color.FromRgb(167, 243, 206)), VerticalAlignment = VerticalAlignment.Center };
                    Grid.SetColumn(id, 1); Grid.SetColumn(score, 2);
                    row.Children.Add(rank); row.Children.Add(id); row.Children.Add(score);
                    rows.Children.Add(new Border { Child = row, Padding = new Thickness(10, 12, 10, 12), Margin = new Thickness(0, 0, 0, 5), CornerRadius = new CornerRadius(8), Background = new SolidColorBrush(mine ? Color.FromRgb(37, 61, 46) : Color.FromRgb(16, 27, 23)) });
                }
                DialogContent.Children.Add(new ScrollViewer { Content = rows, MaxHeight = 210, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
            }
            AddButton("새로고침", ShowRankings);
            AddButton("메인 메뉴로", ReturnToGame, true);
        }
        catch (Exception ex) when (IsUserError(ex))
        {
            if (panel != "ranking" || request != rankingRequest || store != rankingStore) return;
            BeginPanel("ranking", "HALL OF FAME", "랭킹을 불러오지 못했어요.", "계정 저장 폴더의 연결과 접근 권한을 확인해 주세요.");
            AddButton("다시 불러오기", ShowRankings, true);
            AddButton("메인 메뉴로", ReturnToGame);
            SetMessage(ex.Message);
        }
    }
    private void ShowHistory()
    {
        if (userId is null) { ShowAuth(false); SetMessage("계정별 기록을 보려면 로그인해 주세요."); return; }
        BeginPanel("history", "PERSONAL BESTS", "차곡차곡, 내 기록.", $"{userId} 님의 플레이 기록 · 최근순");
        try
        {
            var records = store.Records(userId);
            var best = records.Select(r => r.Score).DefaultIfEmpty().Max();
            var longest = records.Select(r => r.Seconds).DefaultIfEmpty().Max();
            AddText($"최고 {best:N0}점   /   {records.Count:N0}판   /   최장 {longest:F1}초", 13, "#A7F3CE", 0, 15, true);
            if (records.Count == 0) AddText("아직 기록이 없어요. 첫 게임을 시작해 보세요.", 13, "#91AB9C");
            else
            {
                var list = new StackPanel();
                foreach (var r in records.Take(100))
                {
                    var row = new Border { Background = new SolidColorBrush(Color.FromRgb(16, 27, 23)), CornerRadius = new CornerRadius(8), Padding = new Thickness(12), Margin = new Thickness(0, 0, 0, 6) };
                    var body = new StackPanel();
                    body.Children.Add(new TextBlock { Text = $"{r.Score:N0}점   ·   {r.Seconds:F1}초   ·   {r.Dodged}개 회피", FontSize = 13 });
                    body.Children.Add(new TextBlock { Text = r.PlayedAt.ToLocalTime().ToString("yyyy.MM.dd  HH:mm:ss"), FontSize = 10, Foreground = Brushes.Gray, Margin = new Thickness(0, 6, 0, 0) });
                    row.Child = body; list.Children.Add(row);
                }
                DialogContent.Children.Add(new ScrollViewer { Content = list, MaxHeight = 190, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
                if (records.Count > 100) AddText("최근 100개를 표시합니다. 전체 기록은 JSON에 보관됩니다.", 10, "#91AB9C", 4, 8);
            }
        }
        catch (Exception ex) when (IsUserError(ex)) { SetMessage(ex.Message); }
        AddButton("돌아가기", ReturnToGame);
    }
    private void ShowSettings()
    {
        BeginPanel("settings", "MAKE IT YOURS", "기척 없이, 가볍게.", "투명 모드는 배경·상하단 바·테두리를 지웁니다.\nF2로 설정 열기 / 닫기 · Alt + 캐릭터 드래그로 창 이동");
        var transparent = new CheckBox { Content = "PNG 배경 제거처럼 완전 투명 · UI 숨기기", IsChecked = preferences.Transparent };
        transparent.Click += (_, _) => { preferences.Transparent = transparent.IsChecked == true; ApplyAppearance(); SavePreferences(); };
        DialogContent.Children.Add(transparent);
        AddText("배경 불투명도 · 캐릭터는 선명하게 유지", 11, "#A8BCAF", 8, 6);
        var slider = new Slider { Minimum = 0, Maximum = 100, Value = preferences.BackgroundStrength * 100, TickFrequency = 10, IsSnapToTickEnabled = true, Margin = new Thickness(0, 5, 0, 5) };
        System.Windows.Automation.AutomationProperties.SetName(slider, "배경 불투명도");
        slider.ValueChanged += (_, _) => { preferences.BackgroundStrength = slider.Value / 100; ApplyAppearance(); };
        slider.PreviewMouseLeftButtonUp += (_, _) => SavePreferences(); slider.LostKeyboardFocus += (_, _) => SavePreferences();
        DialogContent.Children.Add(slider);
        AddAlphaSlider("캐릭터 알파", preferences.PlayerAlpha, value => preferences.PlayerAlpha = value);
        AddAlphaSlider("떨어지는 똥 알파", preferences.HazardAlpha, value => preferences.HazardAlpha = value);
        var score = new CheckBox { Content = "투명 모드에서 작은 점수만 표시", IsChecked = preferences.ShowQuietScore };
        score.Click += (_, _) => { preferences.ShowQuietScore = score.IsChecked == true; ApplyAppearance(); SavePreferences(); };
        DialogContent.Children.Add(score);
        AddAlphaSlider("작은 점수 알파", preferences.ScoreAlpha, value => preferences.ScoreAlpha = value);
        var top = new CheckBox { Content = "항상 다른 창 위에 표시", IsChecked = preferences.AlwaysOnTop };
        top.Click += (_, _) => { preferences.AlwaysOnTop = top.IsChecked == true; ApplyAppearance(); SavePreferences(); };
        DialogContent.Children.Add(top);
        AddText("창 크기", 12, "#B6C7BC", 12, 6, true);
        AddText($"현재 {ActualWidth:0} × {ActualHeight:0}", 11, "#91AB9C", 0, 4);
        AddButton("창 크기 설정 모드…", EnterSizeMode);
        AddButton("작은 창 360 × 440", () => { preferences.Transparent = true; ApplyAppearance(); Width = 360; Height = 440; RememberWindowSize(); ShowSettings(); SavePreferences(); });
        AddButton("기본 창 480 × 740", () => { Width = 480; Height = 740; RememberWindowSize(); ShowSettings(); SavePreferences(); });
        AddText("저장 폴더", 12, "#B6C7BC", 12, 6, true);
        AddButton("저장 폴더 선택…", ChooseFolder).ToolTip = store.Folder;
        AddButton("계정 · 로그인 / 로그아웃", ShowAccount);
        AddButton("내 기록 보기", ShowHistory);
        AddButton("완료 · 게임으로", CloseSettings, true);
        AddText($"버전 {UpdateService.CurrentVersion}", 11, "#91AB9C", 14, 4);
        AddButton("업데이트 확인", () => _ = CheckUpdatesAsync(true));
        AddButton("앱 종료", Close);
    }
    private async Task CheckUpdatesAsync(bool manual)
    {
        if (checkingUpdate || installingUpdate) return;
        checkingUpdate = true;
        try
        {
            availableUpdate = await updateService.CheckAsync(updateLifetime.Token);
            if (availableUpdate is null && manual)
                MessageBox.Show(this, "현재 설치된 버전이 최신입니다. 새 배포가 준비되면 다시 안내합니다.", "업데이트 확인", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex) when (IsUserError(ex) || ex is HttpRequestException or OperationCanceledException or JsonException or KeyNotFoundException or InvalidOperationException)
        {
            availableUpdate = null;
            if (manual && !updateLifetime.IsCancellationRequested)
                MessageBox.Show(this, "업데이트를 확인하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.\n\n" + ex.Message, "업데이트 확인", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        finally { checkingUpdate = false; }
        if (!updateLifetime.IsCancellationRequested) OfferUpdate(manual);
    }
    private async void OfferUpdate(bool manual)
    {
        var update = availableUpdate;
        if (update is null || offeringUpdate || installingUpdate || busy || sizeModeRestore is not null || !IsVisible || !IsActive ||
            pendingRecord is not null || playState == PlayState.Playing || (!manual && offeredUpdates.Contains(update.Tag))) return;
        offeringUpdate = true; offeredUpdates.Add(update.Tag);
        try
        {
            if (MessageBox.Show(this, $"업데이트가 있습니다. 업데이트하시겠습니까?\n\n현재 버전: {UpdateService.CurrentVersion}\n새 버전: {update.Version}\n\n업데이트 후 게임이 다시 실행됩니다.", "AKC미니게임 업데이트", MessageBoxButton.YesNo, MessageBoxImage.Information) == MessageBoxResult.Yes)
                await InstallUpdateAsync(update);
        }
        finally { offeringUpdate = false; }
    }
    private async Task InstallUpdateAsync(AvailableUpdate update)
    {
        PauseGame();
        if (!SavePreferences()) return;
        installingUpdate = true; busy = true;
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(updateLifetime.Token);
        BeginPanel("update", "A LITTLE REFRESH", "새 버전을 준비하고 있어요.", "다운로드와 파일 검증 중입니다. 완료하면 자동으로 다시 실행됩니다.");
        var cancel = new Button { Content = "다운로드 취소", Margin = new Thickness(0, 8, 0, 0) };
        cancel.Click += (_, _) => { cancellation.Cancel(); cancel.IsEnabled = false; };
        DialogContent.Children.Add(cancel);
        try
        {
            var probe = Path.Combine(AppContext.BaseDirectory, $".ddongvoid-update-check-{Guid.NewGuid():N}");
            using (new FileStream(probe, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose)) { }
            var payload = await Task.Run(() => updateService.PrepareAsync(update, cancellation.Token), cancellation.Token);
            var helperDirectory = Path.Combine(Path.GetDirectoryName(payload)!, "helper");
            Directory.CreateDirectory(helperDirectory);
            foreach (var name in UpdatePackage.RequiredFiles.Where(name => name.StartsWith("DDongVoid.Updater.", StringComparison.Ordinal)))
                File.Copy(Path.Combine(payload, name), Path.Combine(helperDirectory, name));
            using var current = Process.GetCurrentProcess();
            var start = new ProcessStartInfo(Path.Combine(helperDirectory, "DDongVoid.Updater.exe")) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = helperDirectory };
            start.ArgumentList.Add(current.Id.ToString());
            start.ArgumentList.Add(current.StartTime.ToUniversalTime().Ticks.ToString());
            start.ArgumentList.Add(AppContext.BaseDirectory);
            start.ArgumentList.Add(payload);
            if (Environment.GetCommandLineArgs().Contains("--portable")) start.ArgumentList.Add("--portable");
            using var helper = Process.Start(start) ?? throw new IOException("업데이트 실행 파일을 시작하지 못했습니다.");
            busy = false;
            Close();
        }
        catch (Exception ex) when (IsUserError(ex) || ex is HttpRequestException or OperationCanceledException or BadImageFormatException or System.ComponentModel.Win32Exception)
        {
            busy = false; installingUpdate = false;
            ReturnToGame();
            SetMessage(ex is OperationCanceledException ? "업데이트를 취소했습니다. 현재 버전을 계속 사용할 수 있습니다." : "업데이트를 완료하지 못했습니다. 현재 버전은 유지됩니다.\n" + ex.Message);
        }
        finally { busy = false; installingUpdate = false; }
    }
    private void AddAlphaSlider(string label, double initial, Action<double> set)
    {
        var text = AddText($"{label}  {initial:P0}", 11, "#A8BCAF", 10, 6);
        var slider = new Slider { Minimum = 0, Maximum = 100, Value = initial * 100, TickFrequency = 5, IsSnapToTickEnabled = true };
        System.Windows.Automation.AutomationProperties.SetName(slider, label);
        slider.ValueChanged += (_, _) => { set(slider.Value / 100); text.Text = $"{label}  {slider.Value:0}%"; ApplyAppearance(); };
        slider.PreviewMouseLeftButtonUp += (_, _) => SavePreferences();
        slider.LostKeyboardFocus += (_, _) => SavePreferences();
        DialogContent.Children.Add(slider);
    }
    private void CloseSettings()
    {
        SavePreferences();
        if (playState == PlayState.Paused) ResumeGame(); else ReturnToGame();
    }
    private void ChooseFolder()
    {
        if (pendingRecord is not null) { SetMessage("미저장 기록이 있습니다. 게임 결과 화면에서 먼저 저장해 주세요."); return; }
        var dialog = new OpenFolderDialog { Title = "계정과 기록을 저장할 폴더 선택", Multiselect = false };
        if (Directory.Exists(store.Folder)) dialog.InitialDirectory = store.Folder;
        if (dialog.ShowDialog(this) != true) return;
        try
        {
            var candidate = new LocalStore(dialog.FolderName); candidate.Validate();
            var probe = Path.Combine(candidate.Folder, $".ddongvoid-writecheck-{Guid.NewGuid():N}");
            using (new FileStream(probe, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose)) { }
            var old = preferences.DataFolder; preferences.DataFolder = candidate.Folder;
            if (!SavePreferences()) { preferences.DataFolder = old; return; }
            store = candidate; userId = null; bestScore = 0; playState = PlayState.Home; pendingRecord = null;
            Surface.Engine.Reset(); Surface.Demo = true; Surface.InvalidateVisual(); startupError = null;
            UpdateHud(); ShowSettings(); SetMessage("저장 폴더를 변경했습니다. 이 폴더의 계정으로 로그인해 주세요.", true);
        }
        catch (Exception ex) when (IsUserError(ex)) { SetMessage(ex.Message); }
    }
    private bool HasRememberedSession => preferences.RememberedUser is not null && preferences.RememberedKey is not null &&
        string.Equals(preferences.RememberedFolder, store.Folder, StringComparison.OrdinalIgnoreCase);
    private void ForgetSession()
    {
        if (preferences.RememberedUser is null && preferences.RememberedKey is null) return;
        preferences.RememberedUser = preferences.RememberedFolder = preferences.RememberedKey = null;
        SavePreferences();
    }
    // Runs off the UI thread so an offline share cannot delay the game window.
    private async Task ResumeSessionAsync()
    {
        if (userId is not null || resumingSession || !HasRememberedSession) return;
        string id = preferences.RememberedUser!, key = preferences.RememberedKey!;
        var sessionStore = store; string? error = null;
        resumingSession = true; UpdateHud(); if (panel == "home") ShowHome();
        try
        {
            var resumed = await Task.Run(() => sessionStore.ResumeSession(id, key));
            var best = await Task.Run(() => sessionStore.BestScore(resumed));
            if (userId is null && store == sessionStore) { userId = resumed; bestScore = best; startupError = null; }
        }
        catch (ArgumentException ex) { if (store == sessionStore) ForgetSession(); error = ex.Message; }
        catch (Exception ex) when (IsUserError(ex)) { error = "저장된 로그인을 확인하지 못했습니다. 공유 폴더 연결을 확인해 주세요.\n" + ex.Message; }
        finally { resumingSession = false; }
        UpdateHud();
        if (panel == "home" && !busy) { ShowHome(); if (error is not null) SetMessage(error); }
    }
    private void RememberWindowSize()
    {
        if (WindowState != WindowState.Normal) return;
        preferences.WindowWidth = Math.Round(ActualWidth); preferences.WindowHeight = Math.Round(ActualHeight);
    }
    private void EnterSizeMode()
    {
        if (sizeModeRestore is not null) return;
        sizeModeRestore = new Rect(Left, Top, ActualWidth, ActualHeight);
        panel = "size"; Overlay.Visibility = Visibility.Collapsed;
        SizeModeLayer.Visibility = Visibility.Visible; UpdateSizeModeText(); Focus();
    }
    private void ExitSizeMode(bool save)
    {
        if (sizeModeRestore is not Rect restore) return;
        sizeModeRestore = null; SizeModeLayer.Visibility = Visibility.Collapsed;
        if (!save) { Left = restore.Left; Top = restore.Top; Width = restore.Width; Height = restore.Height; }
        ShowSettings();
        if (save) { RememberWindowSize(); if (SavePreferences()) SetMessage($"창 크기를 {ActualWidth:0} × {ActualHeight:0}(으)로 저장했습니다.", true); }
    }
    private void UpdateSizeModeText() => SizeModeText.Text = $"{ActualWidth:0} × {ActualHeight:0}";
    private void SizeModeSave_Click(object sender, RoutedEventArgs e) => ExitSizeMode(true);
    private void SizeModeCancel_Click(object sender, RoutedEventArgs e) => ExitSizeMode(false);
    // Wide grip zones make every edge easy to grab while the frame is visible.
    private int SizeModeHit(Point p)
    {
        double w = SizeModeLayer.ActualWidth, h = SizeModeLayer.ActualHeight;
        bool left = p.X < SizeModeGrip, right = p.X > w - SizeModeGrip, top = p.Y < SizeModeGrip, bottom = p.Y > h - SizeModeGrip;
        return (top, bottom, left, right) switch
        {
            (true, _, true, _) => 13, (true, _, _, true) => 14, (_, true, true, _) => 16, (_, true, _, true) => 17,
            (true, _, _, _) => 12, (_, true, _, _) => 15, (_, _, true, _) => 10, (_, _, _, true) => 11, _ => 0,
        };
    }
    private void SizeMode_MouseMove(object sender, MouseEventArgs e) => SizeModeLayer.Cursor = SizeModeHit(e.GetPosition(SizeModeLayer)) switch
    {
        10 or 11 => Cursors.SizeWE, 12 or 15 => Cursors.SizeNS, 13 or 17 => Cursors.SizeNWSE, 14 or 16 => Cursors.SizeNESW, _ => Cursors.SizeAll,
    };
    private void SizeMode_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed) return;
        var hit = SizeModeHit(e.GetPosition(SizeModeLayer));
        e.Handled = true;
        if (hit == 0) DragMove();
        else { ReleaseCapture(); SendMessage(new WindowInteropHelper(this).Handle, 0xA1, new IntPtr(hit), IntPtr.Zero); }
    }
    private void Pause_Click(object sender, RoutedEventArgs e)
    {
        if (busy) return;
        if (playState == PlayState.Playing) PauseGame(); else if (playState == PlayState.Paused) ResumeGame();
    }
    private void Account_Click(object sender, RoutedEventArgs e) { if (busy) return; PauseGame(); ShowAccount(); }
    private void History_Click(object sender, RoutedEventArgs e) { if (busy) return; PauseGame(); ShowHistory(); }
    private void Settings_Click(object sender, RoutedEventArgs e) { if (busy) return; PauseGame(); ShowSettings(); }
    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        if (busy || e.IsRepeat || Keyboard.Modifiers != ModifierKeys.None) return;
        if (sizeModeRestore is not null)
        {
            if (e.Key is Key.Enter or Key.F2) ExitSizeMode(true);
            else if (e.Key == Key.Escape) ExitSizeMode(false);
            e.Handled = e.Key is Key.Enter or Key.F2 or Key.Escape or Key.Space;
            return;
        }
        if (e.Key == Key.F2)
        {
            if (panel == "settings" && Overlay.Visibility == Visibility.Visible) CloseSettings();
            else { PauseGame(); ShowSettings(); }
            e.Handled = true; return;
        }
        if (Keyboard.FocusedElement is TextBox or PasswordBox) return;
        if (e.Key == Key.Escape)
        {
            if (playState == PlayState.Playing) PauseGame(); else if (panel == "pause") ResumeGame(); else ReturnToGame();
            e.Handled = true;
        }
        else if (e.Key == Key.Space && Keyboard.FocusedElement is not Slider && (Overlay.Visibility != Visibility.Visible || panel is "home" or "pause" or "end"))
        {
            if (playState == PlayState.Playing) PauseGame();
            else if (playState == PlayState.Paused) ResumeGame();
            else if (panel == "home") ShowGameList();
            else StartGame();
            e.Handled = true;
        }
    }
    private void Window_Deactivated(object? sender, EventArgs e) => PauseGame();
    private void Window_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (preferences.Transparent && Keyboard.Modifiers == ModifierKeys.Alt && Overlay.Visibility != Visibility.Visible)
        { PauseGame(); DragMove(); e.Handled = true; }
    }
    private void Title_Drag(object sender, MouseButtonEventArgs e)
    {
        if (e.OriginalSource is DependencyObject d)
        {
            for (var item = d; item is not null; item = VisualTreeHelper.GetParent(item)) if (item is Button) return;
        }
        if (e.LeftButton == MouseButtonState.Pressed) { PauseGame(); DragMove(); }
    }
    private void Dialog_Drag(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed) return;
        for (var item = e.OriginalSource as DependencyObject; item is not null && item != Dialog;
             item = item is Visual ? VisualTreeHelper.GetParent(item) : LogicalTreeHelper.GetParent(item))
        {
            if (item is System.Windows.Controls.Primitives.ButtonBase or
                System.Windows.Controls.Primitives.TextBoxBase or PasswordBox or
                System.Windows.Controls.Primitives.RangeBase or System.Windows.Controls.Primitives.Selector)
                return;
        }
        e.Handled = true;
        DragMove();
    }
    private void Resize_Down(object sender, MouseButtonEventArgs e)
    {
        PauseGame(); ReleaseCapture();
        SendMessage(new WindowInteropHelper(this).Handle, 0xA1, new IntPtr(int.Parse((string)((FrameworkElement)sender).Tag)), IntPtr.Zero);
        e.Handled = true;
    }
    private void Hide_Click(object sender, RoutedEventArgs e) => ToggleHidden();
    private void ToggleHidden()
    {
        if (IsVisible && WindowState != WindowState.Minimized)
        { PauseGame(); if (hotkeyRegistered) Hide(); else WindowState = WindowState.Minimized; }
        else { Show(); WindowState = WindowState.Normal; Activate(); }
    }
    private IntPtr WindowProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == 0x0312 && wParam.ToInt32() == 1) { ToggleHidden(); handled = true; }
        return IntPtr.Zero;
    }
    private void Minimize_Click(object sender, RoutedEventArgs e) { PauseGame(); WindowState = WindowState.Minimized; }
    private void Close_Click(object sender, RoutedEventArgs e) => Close();
    private void OnClosing(object? sender, CancelEventArgs e)
    {
        if (busy) { e.Cancel = true; return; }
        if (pendingRecord is not null && MessageBox.Show(this, "저장하지 못한 기록이 있습니다. 저장하지 않고 종료할까요?", "미저장 기록", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
        { e.Cancel = true; ShowEnd(); return; }
        ExitSizeMode(false); RememberWindowSize();
        PauseGame(); SavePreferences();
    }
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool UnregisterHotKey(IntPtr hwnd, int id);
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool ReleaseCapture();
}
