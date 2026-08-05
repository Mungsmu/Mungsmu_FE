import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { COLORS, RADIUS } from '../theme'
import { findUser, saveUser } from '../lib/auth'

const RELATIONS = ['부모', '배우자', '자녀', '형제자매', '기타']

export default function SignUpScreen() {
  const nav = useNavigation()
  const [step, setStep] = useState('form')
  const [form, setForm] = useState({
    name: '', phone: '', email: '', userId: '', password: '', passwordConfirm: '',
    guardianName: '', guardianPhone: '', relation: RELATIONS[0],
  })
  const [idCheck, setIdCheck] = useState(null)
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeError, setCodeError] = useState('')

  const set = (k) => (v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'userId') setIdCheck(null)
  }

  const checkId = () => {
    if (!form.userId.trim()) return
    setIdCheck('checking')
    setTimeout(async () => setIdCheck((await findUser(form.userId.trim())) ? 'dup' : 'ok'), 500)
  }

  const canSubmitForm = form.name.trim() && form.phone.trim() && form.email.trim()
    && form.userId.trim() && idCheck === 'ok'
    && form.password.length >= 8 && form.password === form.passwordConfirm
    && form.guardianName.trim() && form.guardianPhone.trim()

  const sendCode = () => { setCodeSent(true); setCodeError('') }
  const verifyCode = async () => {
    if (code.trim().length !== 6) { setCodeError('6자리 인증번호를 입력해주세요'); return }
    await saveUser({
      userId: form.userId.trim(), password: form.password, name: form.name.trim(),
      phone: form.phone.trim(), email: form.email.trim(),
      guardianName: form.guardianName.trim(), guardianPhone: form.guardianPhone.trim(), relation: form.relation,
    })
    setStep('done')
  }

  if (step === 'done') {
    return (
      <View style={styles.center}>
        <View style={styles.card}>
          <View style={styles.checkIcon}><Text style={{ fontSize: 28 }}>✓</Text></View>
          <Text style={styles.doneTitle}>가입이 완료됐어요</Text>
          <Text style={styles.doneDesc}>
            {form.name}님, 마음숨길과 함께 안심하고 떠나보세요.{'\n'}길찾기 시 보호자 {form.guardianName}님께 SMS로 알려드릴게요.
          </Text>
          <Pressable onPress={() => nav.navigate('Login')} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>로그인하러 가기</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (step === 'sms') {
    return (
      <View style={styles.center}>
        <View style={styles.card}>
          <Pressable onPress={() => setStep('form')}><Text style={styles.backLink}>← 이전</Text></Pressable>
          <Text style={styles.title}>휴대폰 번호 인증</Text>
          <Text style={styles.desc}>{form.phone}로 전송된 인증번호 6자리를 입력해주세요.</Text>

          <Text style={styles.label}>인증번호</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput value={code} onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 6)); setCodeError('') }}
              placeholder="123456" keyboardType="number-pad" placeholderTextColor={COLORS.textMuted}
              style={[styles.input, { flex: 1, textAlign: 'center', letterSpacing: 6, fontWeight: '700', marginBottom: 0 }]} />
            <Pressable onPress={sendCode} style={styles.smsBtn}>
              <Text style={styles.smsBtnText}>{codeSent ? '재전송' : '인증번호 받기'}</Text>
            </Pressable>
          </View>
          {codeSent && <Text style={styles.successText}>✓ 인증번호가 발송됐어요 (테스트용: 아무 6자리 입력)</Text>}
          {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}

          <Pressable onPress={verifyCode} disabled={!codeSent} style={[styles.primaryBtn, { marginTop: 16 }, !codeSent && { opacity: 0.4 }]}>
            <Text style={styles.primaryBtnText}>인증 완료</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bgPage }} contentContainerStyle={{ padding: 24 }}>
      <View style={styles.formCard}>
        <Text style={styles.title}>회원가입</Text>
        <Text style={styles.desc}>보호자 정보를 등록하면 길찾기 시 자동으로 SMS 알림을 보내드려요.</Text>

        <Text style={styles.label}>이름</Text>
        <TextInput value={form.name} onChangeText={set('name')} placeholder="홍길동" placeholderTextColor={COLORS.textMuted} style={styles.input} />

        <Text style={styles.label}>전화번호</Text>
        <TextInput value={form.phone} onChangeText={set('phone')} placeholder="010-0000-0000" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="phone-pad" />

        <Text style={styles.label}>이메일</Text>
        <TextInput value={form.email} onChangeText={set('email')} placeholder="example@email.com" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="email-address" />

        <Text style={styles.label}>아이디</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          <TextInput value={form.userId} onChangeText={set('userId')} placeholder="아이디를 입력하세요" placeholderTextColor={COLORS.textMuted} style={[styles.input, { flex: 1, marginBottom: 0 }]} />
          <Pressable onPress={checkId} style={styles.smsBtn}><Text style={styles.smsBtnText}>중복확인</Text></Pressable>
        </View>
        {idCheck === 'checking' && <Text style={styles.mutedText}>확인 중...</Text>}
        {idCheck === 'ok' && <Text style={styles.successText}>✓ 사용 가능한 아이디예요</Text>}
        {idCheck === 'dup' && <Text style={styles.errorText}>이미 사용 중인 아이디예요</Text>}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>비밀번호</Text>
            <TextInput value={form.password} onChangeText={set('password')} placeholder="8자 이상" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>비밀번호 확인</Text>
            <TextInput value={form.passwordConfirm} onChangeText={set('passwordConfirm')} placeholder="다시 입력" placeholderTextColor={COLORS.textMuted} style={styles.input} secureTextEntry />
          </View>
        </View>
        {!!form.passwordConfirm && form.password !== form.passwordConfirm && (
          <Text style={styles.errorText}>비밀번호가 일치하지 않아요</Text>
        )}

        <View style={styles.guardianSection}>
          <Text style={styles.guardianTitle}>보호자 정보</Text>
          <Text style={styles.label}>보호자 이름</Text>
          <TextInput value={form.guardianName} onChangeText={set('guardianName')} placeholder="김민준" placeholderTextColor={COLORS.textMuted} style={styles.input} />

          <Text style={styles.label}>관계</Text>
          <View style={styles.relationRow}>
            {RELATIONS.map(r => (
              <Pressable key={r} onPress={() => set('relation')(r)} style={[styles.relationChip, form.relation === r && styles.relationChipActive]}>
                <Text style={[styles.relationChipText, form.relation === r && styles.relationChipTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>보호자 전화번호</Text>
          <TextInput value={form.guardianPhone} onChangeText={set('guardianPhone')} placeholder="010-0000-0000" placeholderTextColor={COLORS.textMuted} style={styles.input} keyboardType="phone-pad" />
        </View>

        <Pressable onPress={() => canSubmitForm && setStep('sms')} disabled={!canSubmitForm} style={[styles.primaryBtn, !canSubmitForm && { opacity: 0.4 }]}>
          <Text style={styles.primaryBtnText}>다음 (휴대폰 인증)</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.bgPage, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, alignItems: 'center' },
  formCard: { backgroundColor: '#fff', borderRadius: 24, padding: 28 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.textHead, marginBottom: 6 },
  desc: { fontSize: 13, color: COLORS.textSub, lineHeight: 19, marginBottom: 20, textAlign: 'left' },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textHead, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: COLORS.borderLight, backgroundColor: COLORS.bgPage, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.textBody, marginBottom: 12 },
  smsBtn: { paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.bgSubtle, alignItems: 'center', justifyContent: 'center' },
  smsBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textSub },
  successText: { fontSize: 11.5, color: '#2E7D4F', marginBottom: 10 },
  errorText: { fontSize: 11.5, color: '#A53E33', marginBottom: 10 },
  mutedText: { fontSize: 11.5, color: COLORS.textMuted, marginBottom: 10 },
  guardianSection: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 16, marginTop: 6 },
  guardianTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.textHead, marginBottom: 12 },
  relationRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginBottom: 12 },
  relationChip: { backgroundColor: COLORS.bgSubtle, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  relationChipActive: { backgroundColor: COLORS.primary },
  relationChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSub },
  relationChipTextActive: { color: '#fff' },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  backLink: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 16, alignSelf: 'flex-start' },
  checkIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EAF7EF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  doneTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textHead, marginBottom: 10 },
  doneDesc: { fontSize: 13, color: COLORS.textSub, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
})
