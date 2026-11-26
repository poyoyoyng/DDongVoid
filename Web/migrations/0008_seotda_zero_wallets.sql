-- 0원인 섯다 계정의 잔액을 300만원으로 충전한다. 재실행해도 중복 충전하지 않는다.
UPDATE wallets SET balance = 3000000, bankruptcies = bankruptcies + 1 WHERE balance = 0;
