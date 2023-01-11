import React, { useState, useEffect } from "react";
import "./styles.css";
import Web3 from 'web3';

import { Magic } from "magic-sdk";
import * as sdk from '@loopring-web/loopring-sdk'
import {LOOPRING_EXPORTED_ACCOUNT, LoopringAPI, signatureKeyPairMock, TOKEN_INFO, web3} from "./Loopring";
import * as sign_tools from "@loopring-web/loopring-sdk";

const customNodeOptions = {
    rpcUrl: 'https://goerli.infura.io/v3/a06ed9c6b5424b61beafff27ecc3abf3', // Your own node URL
    chainId: 5, // Your own node's chainId
};

const magic = new Magic("pk_live_49ACDE4AE11F66A8", {
    network: customNodeOptions
});

const web3Magic = new Web3(magic.rpcProvider)

export default function App() {
    const [email, setEmail] = useState("");
    const [publicAddress, setPublicAddress] = useState("");
    const [destinationAddress, setDestinationAddress] = useState("");
    const [sendAmount, setSendAmount] = useState(0);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userMetadata, setUserMetadata] = useState({});
    const [sendingTransaction, setSendingTransaction] = useState(false);

    useEffect(() => {
        magic.user.isLoggedIn().then(async magicIsLoggedIn => {
            setIsLoggedIn(magicIsLoggedIn);
            if (magicIsLoggedIn) {
                const publicAddress = (await magic.user.getMetadata()).publicAddress;
                setPublicAddress(publicAddress);
                setUserMetadata(await magic.user.getMetadata());
            }
        });
    }, [isLoggedIn]);

    const login = async () => {
        await magic.auth.loginWithMagicLink({ email });
        setIsLoggedIn(true);

    };

    const logout = async () => {
        await magic.user.logout();
        setIsLoggedIn(false);
    };

    const loopringSendTransaction = async (payerAddress, payeeAddress, payeeAccountId, amount, _web3) => {
        const { accInfo } = await LoopringAPI.exchangeAPI.getAccount({
            owner: payerAddress,
        });
        console.log("accInfo:", accInfo);

        // Step 2. eddsaKey
        const eddsaKey = await signatureKeyPairMock(accInfo, _web3);
        console.log("eddsaKey:", eddsaKey.sk);

        // Step 3. get apikey
        const { apiKey } = await LoopringAPI.userAPI.getUserApiKey(
            {
                accountId: accInfo.accountId,
            },
            eddsaKey.sk
        );
        console.log("apiKey:", apiKey);

        // Step 4. get storageId
        const storageId = await LoopringAPI.userAPI.getNextStorageId(
            {
                accountId: accInfo.accountId,
                sellTokenId: TOKEN_INFO.tokenMap["LRC"].tokenId,
            },
            apiKey
        );
        console.log("storageId:", storageId);

        const fee = await LoopringAPI.userAPI.getOffchainFeeAmt(
            {
                accountId: accInfo.accountId,
                requestType: sdk.OffchainFeeReqType.TRANSFER_AND_UPDATE_ACCOUNT,
            },
            apiKey
        );
        console.log("fee:", fee);
        const request = {
            exchange: LOOPRING_EXPORTED_ACCOUNT.exchangeAddress,
            payerAddr: accInfo.owner,
            payerId: accInfo.accountId,
            payeeAddr: payeeAddress,
            payeeId: payeeAccountId,
            storageId: storageId.offchainId,
            token: {
                tokenId: TOKEN_INFO.tokenMap.LRC.tokenId,
                volume: amount.toString(),
            },
            maxFee: {
                tokenId: TOKEN_INFO.tokenMap["LRC"].tokenId,
                volume: fee.fees["LRC"].fee ?? "9400000000000000000",
            },
            validUntil: LOOPRING_EXPORTED_ACCOUNT.validUntil,
            payPayeeUpdateAccount: true,
        };

        return  await LoopringAPI.userAPI.submitInternalTransfer({
            request,
            web3: _web3,
            chainId: sdk.ChainId.GOERLI,
            walletType: sdk.ConnectorNames.Unknown,
            eddsaKey: eddsaKey.sk,
            apiKey: apiKey,
        });
    }

    const LoopringGetInfo = async () => {
        const response = await LoopringAPI.exchangeAPI.getExchangeInfo();
        console.log(response);

        const { accInfo } = await LoopringAPI.exchangeAPI.getAccount({
            owner: publicAddress,
        });
        console.log("accInfo:", accInfo);

        // Step 2. eddsaKey
        const eddsaKey = await signatureKeyPairMock(accInfo, web3Magic);
        console.log("eddsaKey:", eddsaKey.sk);

        // Step 3. get apikey
        const { apiKey } = await LoopringAPI.userAPI.getUserApiKey(
            {
                accountId: accInfo.accountId,
            },
            eddsaKey.sk
        );
        console.log("apiKey:", apiKey);

        const result = await LoopringAPI.userAPI.getUserTxs(
            {
                accountId: accInfo.accountId,
                types: [
                    sdk.UserTxTypes.DEPOSIT,
                    sdk.UserTxTypes.TRANSFER,
                    sdk.UserTxTypes.OFFCHAIN_WITHDRAWAL,
                ],
            },
            apiKey
        );
        console.log(result)
    }

    const loopringDeposit = async () => {
        const result = await loopringSendTransaction(
            LOOPRING_EXPORTED_ACCOUNT.address,
            publicAddress,
            0,
            LOOPRING_EXPORTED_ACCOUNT.tradeLRCValue * 2,
            web3
        )
        console.log(result);
    }

    const MagicSendTransaction = async () => {
        const result = await loopringSendTransaction(
            publicAddress,
            LOOPRING_EXPORTED_ACCOUNT.address2,
            LOOPRING_EXPORTED_ACCOUNT.accountId2,
            LOOPRING_EXPORTED_ACCOUNT.tradeLRCValue / 10,
            web3Magic
        )
        console.log(result);
    }

    const loopringAccountInit = async () => {
        // Step 1. get account info
        const { accInfo } = await LoopringAPI.exchangeAPI.getAccount({
            owner: publicAddress,
        });

        // Step 2. use keySeed generateKeyPair
        const keySeed = sdk.BaseAPI.KEY_MESSAGE.replace(
            "${exchangeAddress}",
            LOOPRING_EXPORTED_ACCOUNT.exchangeAddress
        ).replace("${nonce}", accInfo.nonce.toString());
        const eddsaKey = await sdk.generateKeyPair({
            web3: web3Magic,
            address: accInfo.owner,
            keySeed,
            walletType: sdk.ConnectorNames.MetaMask,
            chainId: sdk.ChainId.GOERLI,
        });
        console.log("eddsakey:", eddsaKey.sk);

        // Step 3. fee
        const fee = await LoopringAPI.globalAPI.getActiveFeeInfo({
            accountId: accInfo.accountId,
        });
        console.log("fee:", fee);

        // Step 4. updateAccount (active or rest）
        const result = await LoopringAPI.userAPI.updateAccount({
            request: {
                exchange: LOOPRING_EXPORTED_ACCOUNT.exchangeAddress,
                owner: accInfo.owner,
                accountId: accInfo.accountId,
                publicKey: { x: eddsaKey.formatedPx, y: eddsaKey.formatedPy },
                maxFee: {
                    tokenId: TOKEN_INFO.tokenMap["LRC"].tokenId,
                    volume: fee.fees["LRC"].fee ?? "9400000000000000000",
                },
                keySeed,
                validUntil: LOOPRING_EXPORTED_ACCOUNT.validUntil,
                nonce: accInfo.nonce,
            },
            web3: web3Magic,
            chainId: sdk.ChainId.GOERLI,
            walletType: sdk.ConnectorNames.Unknown,
            isHWAddr: false,
        });
        const { accInfo: updateAccountInfo } =
            await LoopringAPI.exchangeAPI.getAccount({
                owner: publicAddress,
            });
        console.log(
            "updateAccount Result: ",
            result,
            "updateAccountInfo:",
            updateAccountInfo
        );
    }

    return (
        <div className="App">
            {!isLoggedIn ? (
                <div className="container">
                    <h1>Please sign up or login</h1>
                    <input
                        type="email"
                        name="email"
                        required="required"
                        placeholder="Enter your email"
                        onChange={event => {
                            setEmail(event.target.value);
                        }}
                    />
                    <button onClick={login}>Send</button>
                </div>
            ) : (
                <div>
                    <div className="container">
                        <h1>Current user: {userMetadata.email}</h1>
                        <button onClick={logout}>Logout</button>
                    </div>
                    <div className="container">
                        <h1>ETH address</h1>
                        <div className="info">
                            {publicAddress}
                        </div>
                    </div>
                    <div className="container">
                        <h1>Send Transaction</h1>
                        {
                            sendingTransaction ?
                                <div>
                                    <div>
                                        Send transaction success
                                    </div>
                                </div>
                                :
                                <div/>
                        }
                        <div>
                            Step 1
                        </div>
                        <button id="btn-send-txn" onClick={loopringDeposit}>
                            Deposit
                        </button>
                        <div>
                            Step 2
                        </div>
                        <button id="btn-send-txn" onClick={loopringAccountInit}>
                            Active Account
                        </button>
                        <div>
                            Step 3
                        </div>
                        <button id="btn-send-txn" onClick={LoopringGetInfo}>
                            Get Info
                        </button>
                        <div>
                            Step 3
                        </div>
                        <button id="btn-send-txn" onClick={MagicSendTransaction}>
                            Magic Send Transaction
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
